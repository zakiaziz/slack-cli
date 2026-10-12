import type { Client } from "./core/client.js";
import { CliError, usageError } from "./core/errors.js";
import type { PageInfo, Pagination, ResourceCommand, RunResult } from "./core/provider.js";
import { dateOption, type ArgumentSpec, type Context, type Exception, type GroupSpec, type OptionSpec } from "./core/registry.js";
import { DATE_TIME_FORM, echoable, invalidValue, isRecord, readJsonFile, redactCredentials, validateId } from "./core/values.js";

const SLACK_ORDER = "Order is set by Slack and is undocumented.";
const CHANNEL_TYPES = ["public_channel", "private_channel", "mpim", "im"];
const FILE_TYPES = ["all", "spaces", "snippets", "images", "gdocs", "zips", "pdfs"];
const ENVELOPE_KEYS = ["ok", "warning", "response_metadata"];
const MESSAGE_FIELDS = ["text", "blocks", "attachments"];
const ARRAY_FIELDS = ["blocks", "attachments"];
const PERMALINK_FORM = "https://WORKSPACE.slack.com/archives/CHANNEL_ID/pDIGITS";
const SEARCH_LAST_PAGE = 100;

const CHANNEL_ID: ArgumentSpec = {
  name: "CHANNEL_ID",
  description: "Conversation ID, such as C08A1B2C3D4. Find IDs with 'channels list'.",
  check: (value) => validateId("CHANNEL_ID", value),
};
const TS: ArgumentSpec = {
  name: "TS",
  description: "Message timestamp (ts), such as 1712345678.123456. Find it with 'messages list'.",
  check: (value) => validateId("TS", value),
};
const EMOJI: ArgumentSpec = {
  name: "EMOJI",
  description: "Emoji name without colons, such as thumbsup.",
  check: checkEmoji,
};

const MESSAGE_TARGET: Exception = {
  rule: "CLI-GRAM-6",
  reason: "Slack identifies a message by its conversation ID and ts together, so both are positionals.",
};

function domainAction(action: string, term: string): Exception {
  return { rule: "CLI-GRAM-4", reason: `${action} is a domain action that keeps the Slack term (${term}).` };
}

function textOption(lead: string, extra: Partial<OptionSpec> = {}): OptionSpec {
  return {
    name: "text",
    placeholder: "TEXT",
    type: "string",
    required: true,
    description: `${lead}, sent literally. Slack renders mrkdwn formatting in it.`,
    ...extra,
  };
}

/**
 * Page-number pages for files.list and search.messages. The cursor is the decimal offset of the first unread item.
 * lastPage is the highest page number the provider serves.
 */
function pageNumbers(pagingOf: (payload: unknown) => unknown, lastPage?: number): Pagination {
  return {
    detectRepeatedPages: true,
    apply({ query }, page) {
      const offset = offsetOf(page.cursor);
      const count = pageCount(offset, page.size, lastPage);
      query.set("count", String(count));
      query.set("page", String(offset / count + 1));
    },
    read(payload, _collectionKey, page): PageInfo | undefined {
      const paging = pagingOf(payload);
      if (!isRecord(paging) || !isCount(paging.page) || !isCount(paging.pages)) return undefined;
      const total = isCount(paging.total) ? paging.total : undefined;
      const provider = total === undefined ? {} : { provider: { total } };
      const offset = offsetOf(page.cursor);
      const next = offset + pageCount(offset, page.size, lastPage);
      const more = paging.page < paging.pages || (total !== undefined && next < total);
      if (!more) return { nextCursor: null, ...provider };
      const capped = paging.page >= paging.pages || (lastPage !== undefined && paging.page >= lastPage);
      if (capped) return { nextCursor: null, hasMore: true, ...provider };
      return { nextCursor: String(next), ...provider };
    },
    checkCursor(value) {
      if (/^[0-9]{1,15}$/.test(value)) return value;
      throw invalidValue("--cursor", "be a decimal offset", echoable(value), "Use the meta.next_cursor value from a previous result.");
    },
  };
}

function offsetOf(cursor: string | null): number {
  return cursor === null ? 0 : Number(cursor);
}

/**
 * The largest page size up to size that puts offset on a page boundary, so the page number lands exactly on it, within
 * lastPage. Fails when no such size exists, such as offset 100 with size 1 and lastPage 100.
 */
function pageCount(offset: number, size: number, lastPage?: number): number {
  for (let count = size; count >= 1; count -= 1) {
    if (offset % count === 0 && (lastPage === undefined || offset / count + 1 <= lastPage)) return count;
  }
  throw usageError(
    `Slack serves at most ${lastPage ?? 0} pages, so offset ${offset} cannot be read with a page size of ${size}.`,
    "Use a larger --page-size, or a --max-items that leaves a larger last page.",
  );
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const filePages = pageNumbers((payload) => (isRecord(payload) ? payload.paging : undefined));
const searchPages = pageNumbers((payload) => {
  const messages = isRecord(payload) ? payload.messages : undefined;
  return isRecord(messages) ? messages.paging : undefined;
}, SEARCH_LAST_PAGE);

export const groups: GroupSpec[] = [
  { path: ["channels"], summary: "List, get, and mark conversations.", title: "Manage conversations." },
  { path: ["channels", "members"], summary: "List conversation members.", title: "Inspect conversation members." },
  { path: ["files"], summary: "List and get files.", title: "Inspect files." },
  {
    path: ["messages"],
    summary: "List, get, search, update, delete, send, reply, and schedule messages.",
    title: "Manage messages.",
  },
  { path: ["messages", "replies"], summary: "List thread replies.", title: "Inspect thread replies." },
  { path: ["permalinks"], summary: "Get the message a permalink points to.", title: "Resolve message permalinks." },
  { path: ["pins"], summary: "List, add, and remove pinned messages.", title: "Manage pinned messages." },
  { path: ["reactions"], summary: "List, add, and remove reactions on a message.", title: "Manage reactions." },
  { path: ["scheduled-messages"], summary: "List and delete scheduled messages.", title: "Manage scheduled messages." },
  { path: ["usergroups"], summary: "List user groups.", title: "Inspect user groups." },
  { path: ["users"], summary: "List, get, and look up users.", title: "Inspect users." },
];

export const commands: ResourceCommand[] = [
  {
    path: ["channels", "list"],
    summary: "List conversations.",
    arguments: [],
    options: [
      {
        name: "type",
        placeholder: "TYPE",
        type: "enum",
        choices: CHANNEL_TYPES,
        repeatable: true,
        description: "Conversation type to include. Without it, Slack returns public channels only.",
      },
      { name: "exclude-archived", type: "boolean", description: "Leave out archived conversations." },
    ],
    effects: { kind: "read" },
    output: "Collection envelope. data is an array of conversation objects; meta holds profile, next_cursor, and has_more.",
    method: "GET",
    collectionKey: "channels",
    pagination: { max: 999, default: 100, ordering: SLACK_ORDER },
    examples: ["slack channels list --exclude-archived", "slack channels list --type private_channel --type mpim --all --format json"],
    request: (context) => ({
      path: "/conversations.list",
      query: [
        ...joinedQuery(context, "type", "types"),
        ...(context.options.flag("exclude-archived") ? ([["exclude_archived", "true"]] as [string, string][]) : []),
      ],
    }),
  },
  {
    path: ["channels", "get"],
    summary: "Get one conversation.",
    arguments: [CHANNEL_ID],
    options: [],
    effects: { kind: "read" },
    output: "Resource envelope. data is the conversation object; meta has profile.",
    method: "GET",
    resourceKey: "channel",
    examples: ["slack channels get C08A1B2C3D4"],
    request: (context) => ({ path: "/conversations.info", query: [["channel", arg(context, 0)]] }),
  },
  {
    path: ["channels", "members", "list"],
    summary: "List the member user IDs of a conversation.",
    arguments: [CHANNEL_ID],
    options: [],
    effects: { kind: "read" },
    output: "Collection envelope. data is an array of user IDs; meta holds profile, next_cursor, and has_more.",
    method: "GET",
    collectionKey: "members",
    pagination: { max: 999, default: 100, ordering: SLACK_ORDER },
    examples: ["slack channels members list C08A1B2C3D4 --all"],
    request: (context) => ({ path: "/conversations.members", query: [["channel", arg(context, 0)]] }),
  },
  {
    path: ["channels", "mark"],
    summary: "Move the read cursor of a conversation to a message.",
    arguments: [CHANNEL_ID, TS],
    options: [],
    effects: { kind: "remote-mutation", summary: "Marks the conversation read up to message TS for the token's user." },
    output: "Resource envelope. data is null, because Slack returns no resource; meta has profile.",
    method: "POST",
    select: withoutEnvelope,
    examples: ["slack channels mark C08A1B2C3D4 1712345678.123456 --dry-run", "slack channels mark C08A1B2C3D4 1712345678.123456 --yes"],
    exceptions: [domainAction("mark", "conversations.mark"), MESSAGE_TARGET],
    request: (context) => ({
      path: "/conversations.mark",
      body: { channel: arg(context, 0), ts: arg(context, 1) },
      effect: `Marks conversation ${arg(context, 0)} read up to message ${arg(context, 1)}.`,
    }),
  },
  {
    path: ["messages", "list"],
    summary: "List messages in a conversation.",
    arguments: [CHANNEL_ID],
    options: [dateOption("oldest", "Messages after", "exclusive"), dateOption("latest", "Messages before", "exclusive")],
    effects: { kind: "read" },
    output:
      "Collection envelope. data is an array of message objects, without thread replies; meta holds profile, next_cursor, and has_more.",
    method: "GET",
    collectionKey: "messages",
    pagination: { max: 999, default: 100, ordering: "Newest first." },
    examples: ["slack messages list C08A1B2C3D4 --oldest 2026-10-01", "slack messages list C08A1B2C3D4 --all --max-items 500 --format json"],
    request: (context) => ({
      path: "/conversations.history",
      query: [["channel", arg(context, 0)], ...tsQuery(context, "oldest"), ...tsQuery(context, "latest")],
    }),
  },
  {
    path: ["messages", "replies", "list"],
    summary: "List a thread: the parent message and its replies.",
    arguments: [CHANNEL_ID, TS],
    options: [],
    effects: { kind: "read" },
    output: "Collection envelope. data is an array of message objects; meta holds profile, next_cursor, and has_more.",
    method: "GET",
    collectionKey: "messages",
    pagination: { max: 999, default: 100, ordering: "Oldest first, starting with the thread parent." },
    examples: ["slack messages replies list C08A1B2C3D4 1712345678.123456 --all"],
    exceptions: [MESSAGE_TARGET],
    request: (context) => ({ path: "/conversations.replies", query: [["channel", arg(context, 0)], ["ts", arg(context, 1)]] }),
  },
  {
    path: ["messages", "get"],
    summary: "Get one message by conversation ID and ts.",
    arguments: [CHANNEL_ID, TS],
    options: [],
    effects: {
      kind: "read",
      summary:
        "Reads conversations.history for a top-level message, then conversations.replies when the message is a thread reply. At most two requests.",
    },
    output: "Resource envelope. data is the message object; meta has profile.",
    examples: ["slack messages get C08A1B2C3D4 1712345678.123456"],
    exceptions: [MESSAGE_TARGET],
    run: (context, client) => findMessage(client, arg(context, 0), arg(context, 1), undefined),
  },
  {
    path: ["messages", "search"],
    summary: "Search messages.",
    arguments: [{ name: "QUERY", description: "Slack search query, with modifiers such as in:#general or from:@ada." }],
    options: [
      {
        name: "sort",
        placeholder: "FIELD",
        type: "enum",
        choices: ["score", "timestamp"],
        description: "Sort field. Without it, Slack sorts by score.",
      },
      {
        name: "sort-dir",
        placeholder: "DIRECTION",
        type: "enum",
        choices: ["asc", "desc"],
        description: "Sort direction. Without it, Slack sorts descending.",
      },
    ],
    effects: { kind: "read", summary: "Needs a user token with the search:read scope." },
    output:
      "Collection envelope. data is an array of matching message objects; meta holds profile, next_cursor, has_more, and provider.total.",
    method: "GET",
    select: (payload) => {
      const messages = isRecord(payload) ? payload.messages : undefined;
      return isRecord(messages) ? messages.matches : undefined;
    },
    collection: true,
    pagination: {
      max: 100,
      default: 100,
      ordering: "Ordered by --sort and --sort-dir. Slack serves at most 100 pages per query.",
      style: searchPages,
    },
    examples: ['slack messages search "deploy in:#releases"', 'slack messages search "from:@ada budget" --sort timestamp --format json'],
    request: (context) => ({
      path: "/search.messages",
      query: [["query", arg(context, 0)], ...optionQuery(context, "sort", "sort"), ...optionQuery(context, "sort-dir", "sort_dir")],
    }),
  },
  {
    path: ["messages", "send"],
    summary: "Post a message to a conversation.",
    arguments: [CHANNEL_ID],
    options: [
      textOption("Message text", { required: false, conflicts: ["file"] }),
      {
        name: "file",
        placeholder: "PATH",
        type: "path",
        description:
          'Read the complete message JSON from PATH, such as {"text": "Fallback", "blocks": [...]}. - reads stdin. CHANNEL_ID supplies the channel.',
      },
    ],
    effects: { kind: "remote-mutation", summary: "Posts a message as the token's user. Needs --text or --file." },
    output: "Resource envelope. data has channel, ts, and message; meta has profile.",
    method: "POST",
    select: withoutEnvelope,
    examples: [
      'slack messages send C08A1B2C3D4 --text "Deploy finished." --dry-run',
      "slack messages send C08A1B2C3D4 --file ./message.json --yes",
    ],
    request: (context) => {
      const channel = arg(context, 0);
      const text = context.options.string("text");
      const file = context.options.string("file");
      if (text === undefined && file === undefined) {
        throw usageError('"messages send" needs --text or --file.', "Add --text TEXT, or --file PATH with the message JSON.");
      }
      const fields = file === undefined ? { text } : messageFile(file);
      return { path: "/chat.postMessage", body: { channel, ...fields }, effect: `Posts a message to conversation ${channel}.` };
    },
  },
  {
    path: ["messages", "reply"],
    summary: "Post a reply in the thread of a message.",
    arguments: [CHANNEL_ID, TS],
    options: [textOption("Reply text")],
    effects: { kind: "remote-mutation", summary: "Posts a thread reply as the token's user." },
    output: "Resource envelope. data has channel, ts, and message; meta has profile.",
    method: "POST",
    select: withoutEnvelope,
    examples: ['slack messages reply C08A1B2C3D4 1712345678.123456 --text "Looking now." --yes'],
    exceptions: [domainAction("reply", "reply in thread"), MESSAGE_TARGET],
    request: (context) => ({
      path: "/chat.postMessage",
      body: { channel: arg(context, 0), thread_ts: arg(context, 1), text: context.options.string("text") },
      effect: `Posts a reply in the thread of message ${arg(context, 1)} in conversation ${arg(context, 0)}.`,
    }),
  },
  {
    path: ["messages", "update"],
    summary: "Replace the text of a message.",
    arguments: [CHANNEL_ID, TS],
    options: [textOption("New message text")],
    effects: { kind: "remote-mutation", summary: "Replaces the message text. The token's user must be able to edit the message." },
    output: "Resource envelope. data has channel, ts, text, and message; meta has profile.",
    method: "POST",
    select: withoutEnvelope,
    examples: ['slack messages update C08A1B2C3D4 1712345678.123456 --text "Deploy finished at 14:05." --yes'],
    exceptions: [MESSAGE_TARGET],
    request: (context) => ({
      path: "/chat.update",
      body: { channel: arg(context, 0), ts: arg(context, 1), text: context.options.string("text") },
      effect: `Replaces the text of message ${arg(context, 1)} in conversation ${arg(context, 0)}.`,
    }),
  },
  {
    path: ["messages", "delete"],
    summary: "Delete a message.",
    arguments: [CHANNEL_ID, TS],
    options: [],
    effects: {
      kind: "remote-mutation",
      summary: "Deletes the message permanently. Slack documents no way to restore a deleted message.",
    },
    output: "Resource envelope. data has channel and ts; meta has profile.",
    method: "POST",
    select: withoutEnvelope,
    examples: ["slack messages delete C08A1B2C3D4 1712345678.123456 --dry-run", "slack messages delete C08A1B2C3D4 1712345678.123456 --yes"],
    exceptions: [MESSAGE_TARGET],
    request: (context) => ({
      path: "/chat.delete",
      body: { channel: arg(context, 0), ts: arg(context, 1) },
      effect: `Permanently deletes message ${arg(context, 1)} from conversation ${arg(context, 0)}. Slack documents no way to restore it.`,
    }),
  },
  {
    path: ["messages", "schedule"],
    summary: "Schedule a message for later.",
    arguments: [CHANNEL_ID],
    options: [
      textOption("Message text"),
      {
        name: "at",
        placeholder: "DATETIME",
        type: "date",
        required: true,
        description: `When Slack posts the message. Accepts YYYY-MM-DD (00:00 UTC) or ${DATE_TIME_FORM}. Must be in the future; Slack accepts up to 120 days ahead and drops fractional seconds.`,
      },
    ],
    effects: { kind: "remote-mutation", summary: "Schedules a message as the token's user. 'scheduled-messages delete' cancels it." },
    output: "Resource envelope. data has channel, scheduled_message_id, post_at, and message; meta has profile.",
    method: "POST",
    select: withoutEnvelope,
    examples: ['slack messages schedule C08A1B2C3D4 --text "Standup in 5 minutes." --at 2026-10-13T08:55:00-05:00 --yes'],
    exceptions: [domainAction("schedule", "chat.scheduleMessage")],
    request: (context) => {
      const at = context.options.string("at") ?? "";
      const postAt = Math.floor(Date.parse(at) / 1000);
      if (postAt <= Math.floor(Date.now() / 1000)) {
        throw invalidValue("--at", "be in the future", at, "Use a later --at DATETIME.");
      }
      return {
        path: "/chat.scheduleMessage",
        body: { channel: arg(context, 0), text: context.options.string("text"), post_at: postAt },
        effect: `Schedules a message to conversation ${arg(context, 0)} for ${new Date(postAt * 1000).toISOString()}.`,
      };
    },
  },
  {
    path: ["scheduled-messages", "list"],
    summary: "List scheduled messages.",
    arguments: [],
    options: [channelOption("Only scheduled messages in this conversation.")],
    effects: { kind: "read", summary: "Needs a user token with the chat:write scope, which Slack requires for this read." },
    output: "Collection envelope. data is an array of scheduled message objects; meta holds profile, next_cursor, and has_more.",
    method: "GET",
    collectionKey: "scheduled_messages",
    pagination: { max: 100, default: 100, maxSource: "tool", ordering: SLACK_ORDER },
    examples: ["slack scheduled-messages list", "slack scheduled-messages list --channel C08A1B2C3D4 --format json"],
    request: (context) => ({ path: "/chat.scheduledMessages.list", query: optionQuery(context, "channel", "channel") }),
  },
  {
    path: ["scheduled-messages", "delete"],
    summary: "Delete a scheduled message before Slack posts it.",
    arguments: [
      CHANNEL_ID,
      {
        name: "SCHEDULED_MESSAGE_ID",
        description: "Scheduled message ID, such as Q08A1B2C3D4. Find it with 'scheduled-messages list'.",
        check: (value) => validateId("SCHEDULED_MESSAGE_ID", value),
      },
    ],
    options: [],
    effects: {
      kind: "remote-mutation",
      summary: "Deletes the scheduled message, so Slack never posts it. Slack documents no way to restore it.",
    },
    output: "Resource envelope. data is null, because Slack returns no resource; meta has profile.",
    method: "POST",
    select: withoutEnvelope,
    examples: ["slack scheduled-messages delete C08A1B2C3D4 Q08A1B2C3D4 --yes"],
    exceptions: [
      { rule: "CLI-GRAM-6", reason: "Slack identifies a scheduled message by its conversation ID and scheduled message ID together." },
    ],
    request: (context) => ({
      path: "/chat.deleteScheduledMessage",
      body: { channel: arg(context, 0), scheduled_message_id: arg(context, 1) },
      effect: `Deletes scheduled message ${arg(context, 1)} in conversation ${arg(context, 0)}. Slack documents no way to restore it.`,
    }),
  },
  {
    path: ["permalinks", "get"],
    summary: "Get the message a permalink points to.",
    arguments: [
      {
        name: "PERMALINK",
        description: `Message link from Slack's Copy link, such as https://example.slack.com/archives/C08A1B2C3D4/p1712345678123456.`,
        check: (value) => {
          parsePermalink(value);
          return value;
        },
      },
    ],
    options: [],
    effects: {
      kind: "read",
      summary:
        "Reads the conversation ID, ts, and thread_ts from the link without a request, then reads the message like 'messages get'. At most two requests.",
    },
    output: "Resource envelope. data is the message object; meta has profile.",
    examples: [
      "slack permalinks get https://example.slack.com/archives/C08A1B2C3D4/p1712345678123456",
      "slack permalinks get 'https://example.slack.com/archives/C08A1B2C3D4/p1712345690000200?thread_ts=1712345678.123456&cid=C08A1B2C3D4'",
    ],
    run: (context, client) => {
      const link = parsePermalink(arg(context, 0));
      return findMessage(client, link.channel, link.ts, link.threadTs);
    },
  },
  {
    path: ["pins", "list"],
    summary: "List the pinned items of a conversation.",
    arguments: [CHANNEL_ID],
    options: [],
    effects: { kind: "read" },
    output: "Collection envelope. data is an array of pinned items; meta has profile.",
    method: "GET",
    collectionKey: "items",
    unpaginated: "Not paginated. Slack returns every pinned item in one response; meta has profile.",
    examples: ["slack pins list C08A1B2C3D4"],
    request: (context) => ({ path: "/pins.list", query: [["channel", arg(context, 0)]] }),
  },
  pinCommand("add", "pins.add", "Pin a message.", (channel, ts) => `Pins message ${ts} in conversation ${channel}.`),
  pinCommand("remove", "pins.remove", "Unpin a message.", (channel, ts) => `Unpins message ${ts} in conversation ${channel}.`),
  {
    path: ["reactions", "list"],
    summary: "List the reactions on a message.",
    arguments: [CHANNEL_ID, TS],
    options: [],
    effects: { kind: "read" },
    output: "Collection envelope. data is an array of reactions with name, count, and users; meta has profile.",
    method: "GET",
    select: (payload) => {
      const message = isRecord(payload) ? payload.message : undefined;
      return isRecord(message) ? (message.reactions ?? []) : undefined;
    },
    collection: true,
    unpaginated: "Not paginated. Slack returns every reaction on the message in one response; meta has profile.",
    examples: ["slack reactions list C08A1B2C3D4 1712345678.123456"],
    exceptions: [MESSAGE_TARGET],
    request: (context) => ({
      path: "/reactions.get",
      query: [["channel", arg(context, 0)], ["timestamp", arg(context, 1)], ["full", "true"]],
    }),
  },
  reactionCommand("add", "reactions.add", "Add a reaction to a message.", (emoji, ts, channel) => `Adds :${emoji}: to message ${ts} in conversation ${channel}.`),
  reactionCommand(
    "remove",
    "reactions.remove",
    "Remove a reaction from a message.",
    (emoji, ts, channel) => `Removes :${emoji}: from message ${ts} in conversation ${channel}.`,
  ),
  {
    path: ["files", "list"],
    summary: "List files.",
    arguments: [],
    options: [
      channelOption("Only files shared in this conversation."),
      {
        name: "user",
        placeholder: "USER_ID",
        type: "string",
        description: "Only files created by this user.",
        check: (value) => validateId("--user", value),
      },
      {
        name: "type",
        placeholder: "TYPE",
        type: "enum",
        choices: FILE_TYPES,
        repeatable: true,
        description: "File type to include. Without it, Slack returns every type.",
      },
    ],
    effects: { kind: "read" },
    output: "Collection envelope. data is an array of file objects; meta holds profile, next_cursor, has_more, and provider.total.",
    method: "GET",
    collectionKey: "files",
    pagination: { max: 100, default: 100, maxSource: "tool", ordering: "Newest first.", style: filePages },
    examples: ["slack files list --channel C08A1B2C3D4", "slack files list --type pdfs --all --max-items 200 --format json"],
    request: (context) => ({
      path: "/files.list",
      query: [...optionQuery(context, "channel", "channel"), ...optionQuery(context, "user", "user"), ...joinedQuery(context, "type", "types")],
    }),
  },
  {
    path: ["files", "get"],
    summary: "Get one file.",
    arguments: [{ name: "FILE_ID", description: "File ID, such as F08A1B2C3D4.", check: (value) => validateId("FILE_ID", value) }],
    options: [],
    effects: { kind: "read" },
    output: "Resource envelope. data is the file object; meta has profile.",
    method: "GET",
    resourceKey: "file",
    examples: ["slack files get F08A1B2C3D4"],
    request: (context) => ({ path: "/files.info", query: [["file", arg(context, 0)]] }),
  },
  {
    path: ["usergroups", "list"],
    summary: "List user groups.",
    arguments: [],
    options: [
      { name: "include-disabled", type: "boolean", description: "Include disabled user groups." },
      { name: "include-users", type: "boolean", description: "Include the user IDs of each group." },
      { name: "include-count", type: "boolean", description: "Include the member count of each group." },
    ],
    effects: { kind: "read" },
    output: "Collection envelope. data is an array of user group objects; meta has profile.",
    method: "GET",
    collectionKey: "usergroups",
    unpaginated: "Not paginated. Slack returns every user group in one response; meta has profile.",
    examples: ["slack usergroups list --include-count"],
    request: (context) => ({
      path: "/usergroups.list",
      query: ["include-disabled", "include-users", "include-count"]
        .filter((name) => context.options.flag(name))
        .map((name): [string, string] => [name.replaceAll("-", "_"), "true"]),
    }),
  },
  {
    path: ["users", "list"],
    summary: "List users in the workspace.",
    arguments: [],
    options: [],
    effects: { kind: "read" },
    output: "Collection envelope. data is an array of user objects; meta holds profile, next_cursor, and has_more.",
    method: "GET",
    collectionKey: "members",
    pagination: { max: 200, default: 100, maxSource: "tool", ordering: SLACK_ORDER },
    examples: ["slack users list", "slack users list --all --format json"],
    request: () => ({ path: "/users.list" }),
  },
  {
    path: ["users", "get"],
    summary: "Get one user.",
    arguments: [{ name: "USER_ID", description: "User ID, such as U08A1B2C3D4.", check: (value) => validateId("USER_ID", value) }],
    options: [],
    effects: { kind: "read" },
    output: "Resource envelope. data is the user object; meta has profile.",
    method: "GET",
    resourceKey: "user",
    examples: ["slack users get U08A1B2C3D4"],
    request: (context) => ({ path: "/users.info", query: [["user", arg(context, 0)]] }),
  },
  {
    path: ["users", "lookup"],
    summary: "Get one user by email address.",
    arguments: [{ name: "EMAIL", description: "Email address of the user.", check: checkEmail }],
    options: [],
    effects: { kind: "read", summary: "Needs a user token with the users:read.email scope." },
    output: "Resource envelope. data is the user object; meta has profile.",
    method: "GET",
    resourceKey: "user",
    examples: ["slack users lookup ada@example.com"],
    exceptions: [domainAction("lookup", "users.lookupByEmail")],
    request: (context) => ({ path: "/users.lookupByEmail", query: [["email", arg(context, 0)]] }),
  },
];

function pinCommand(action: string, method: string, summary: string, effect: (channel: string, ts: string) => string): ResourceCommand {
  return {
    path: ["pins", action],
    summary,
    arguments: [CHANNEL_ID, TS],
    options: [],
    effects: { kind: "remote-mutation", summary: action === "add" ? "Pins the message in its conversation." : "Unpins the message. Pin it again with 'pins add'." },
    output: "Resource envelope. data is null, because Slack returns no resource; meta has profile.",
    method: "POST",
    select: withoutEnvelope,
    examples: [`slack pins ${action} C08A1B2C3D4 1712345678.123456 --yes`],
    exceptions: [domainAction(action, method), MESSAGE_TARGET],
    request: (context) => ({
      path: `/${method}`,
      body: { channel: arg(context, 0), timestamp: arg(context, 1) },
      effect: effect(arg(context, 0), arg(context, 1)),
    }),
  };
}

function reactionCommand(
  action: string,
  method: string,
  summary: string,
  effect: (emoji: string, ts: string, channel: string) => string,
): ResourceCommand {
  return {
    path: ["reactions", action],
    summary,
    arguments: [CHANNEL_ID, TS, EMOJI],
    options: [],
    effects: {
      kind: "remote-mutation",
      summary: action === "add" ? "Adds the reaction as the token's user." : "Removes the token user's reaction. Add it again with 'reactions add'.",
    },
    output: "Resource envelope. data is null, because Slack returns no resource; meta has profile.",
    method: "POST",
    select: withoutEnvelope,
    examples: [`slack reactions ${action} C08A1B2C3D4 1712345678.123456 thumbsup --yes`],
    exceptions: [domainAction(action, method), MESSAGE_TARGET],
    request: (context) => ({
      path: `/${method}`,
      body: { channel: arg(context, 0), timestamp: arg(context, 1), name: arg(context, 2) },
      effect: effect(arg(context, 2), arg(context, 1), arg(context, 0)),
    }),
  };
}

function channelOption(description: string): OptionSpec {
  return {
    name: "channel",
    placeholder: "CHANNEL_ID",
    type: "string",
    description,
    check: (value) => validateId("--channel", value),
  };
}

function arg(context: Context, index: number): string {
  return context.args[index] ?? "";
}

function optionQuery(context: Context, option: string, apiName: string): [string, string][] {
  const value = context.options.string(option);
  return value === undefined ? [] : [[apiName, value]];
}

/** A repeatable option sent as one comma-separated parameter, the form Slack documents for types. */
function joinedQuery(context: Context, option: string, apiName: string): [string, string][] {
  const values = context.options.strings(option);
  return values.length === 0 ? [] : [[apiName, [...new Set(values)].join(",")]];
}

/** A date option sent as a Slack timestamp: seconds since the epoch with six decimals. */
function tsQuery(context: Context, option: string): [string, string][] {
  const value = context.options.string(option);
  return value === undefined ? [] : [[option, (Date.parse(value) / 1000).toFixed(6)]];
}

/** The response without Slack's envelope keys (ok, warning, response_metadata), or null when nothing else remains. */
function withoutEnvelope(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  const rest = Object.fromEntries(Object.entries(payload).filter(([key]) => !ENVELOPE_KEYS.includes(key)));
  return Object.keys(rest).length > 0 ? rest : null;
}

function messageFile(path: string): Record<string, unknown> {
  const value = readJsonFile("--file", path);
  if (!isRecord(value)) {
    throw usageError("--file must contain a JSON object with message fields.", 'Wrap blocks as {"text": "Fallback", "blocks": [...]}.');
  }
  if (Object.hasOwn(value, "channel")) {
    throw usageError("--file must not contain channel; CHANNEL_ID supplies it.", "Remove channel from the file.");
  }
  if (!MESSAGE_FIELDS.some((field) => Object.hasOwn(value, field))) {
    throw usageError("--file must contain text, blocks, or attachments.", 'Add "text", "blocks", or "attachments" to the file.');
  }
  if (Object.hasOwn(value, "text") && (typeof value.text !== "string" || value.text === "")) {
    throw usageError("--file text must be a nonempty string.", 'Use "text": "Message text".');
  }
  const notArray = ARRAY_FIELDS.find((field) => Object.hasOwn(value, field) && !Array.isArray(value[field]));
  if (notArray) throw usageError(`--file ${notArray} must be a JSON array.`, `Use "${notArray}": [...].`);
  return value;
}

interface Permalink {
  channel: string;
  ts: string;
  threadTs?: string;
}

/** Reads the conversation ID, ts, and thread_ts from a Slack message link. */
function parsePermalink(value: string): Permalink {
  const fail = (): CliError =>
    invalidValue("PERMALINK", `be a Slack message link like ${PERMALINK_FORM}`, echoable(redactCredentials(value)), "Copy the link with Copy link on the message in Slack.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw fail();
  }
  const slackHost = url.hostname === "slack.com" || url.hostname.endsWith(".slack.com");
  if (url.protocol !== "https:" || !slackHost || url.username || url.password) throw fail();
  const match = /^\/archives\/([A-Za-z0-9]+)\/p([0-9]{7,})$/.exec(url.pathname);
  const channel = match?.[1];
  const digits = match?.[2];
  if (channel === undefined || digits === undefined) throw fail();
  const ts = `${digits.slice(0, -6)}.${digits.slice(-6)}`;
  const thread = url.searchParams.get("thread_ts");
  if (thread !== null && !/^[0-9]+\.[0-9]+$/.test(thread)) throw fail();
  return { channel, ts, ...(thread !== null && thread !== ts ? { threadTs: thread } : {}) };
}

/**
 * Finds one message. A top-level message comes from conversations.history; a thread reply is not there, so
 * conversations.replies reads it, starting from thread_ts when the link supplies it.
 */
async function findMessage(client: Client, channel: string, ts: string, threadTs: string | undefined): Promise<RunResult> {
  const bounds: [string, string][] = [["latest", ts], ["oldest", ts], ["inclusive", "true"]];
  if (threadTs === undefined) {
    const top = await client.send({
      method: "GET",
      path: "/conversations.history",
      query: [["channel", channel], ...bounds, ["limit", "1"]],
      mutation: false,
      collectionKey: "messages",
    });
    const found = messageWithTs(top.data, ts);
    if (found) return { data: found, meta: top.meta };
  }
  const thread = await client.send({
    method: "GET",
    path: "/conversations.replies",
    query: [["channel", channel], ["ts", threadTs ?? ts], ...bounds],
    mutation: false,
    collectionKey: "messages",
  });
  const found = messageWithTs(thread.data, ts);
  if (found) return { data: found, meta: thread.meta };
  throw new CliError("NOT_FOUND", `Slack returned no message ${echoable(ts)} in conversation ${echoable(channel)}.`, {
    hint: `Run 'slack messages list ${echoable(channel)}' to find message timestamps.`,
  });
}

function messageWithTs(items: unknown, ts: string): Record<string, unknown> | undefined {
  if (!Array.isArray(items)) return undefined;
  return items.find((item): item is Record<string, unknown> => isRecord(item) && item.ts === ts);
}

function checkEmoji(value: string): string {
  if (/^[^:\s]+$/.test(value)) return value;
  throw invalidValue("EMOJI", "be an emoji name without colons or spaces", echoable(value), "Use EMOJI thumbsup, not :thumbsup:.");
}

function checkEmail(value: string): string {
  if (/^[^@\s]+@[^@\s]+$/.test(value)) return value;
  throw invalidValue("EMAIL", "be an email address", echoable(value), "Use EMAIL ada@example.com.");
}
