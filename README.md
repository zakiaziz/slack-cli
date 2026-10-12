# slack-cli

Command-line interface for the Slack API. It reads conversations, messages, threads, users, files, reactions, pins, user groups, and search results with a Slack user token, and can post, update, delete, and schedule messages, add and remove reactions and pins, and mark conversations read. Each profile is locked to read or write access, so a read-only profile never changes Slack state. It is not an official Slack product.

## Install

Requires Node.js 22 or newer.

```bash
npm install -g @zakiaziz/slack-cli
bun add -g @zakiaziz/slack-cli
cd slack-cli && bun run build && bun link
```

## Quick start

```bash
slack setup --access read
# List public channels, without archived ones.
slack channels list --exclude-archived
# Read the latest 20 messages of a channel.
slack messages list C08A1B2C3D4 --page-size 20
# Search every message the token's user can see.
slack messages search "deploy in:#releases"
```

## Commands

### channels

| Command | Description | Options |
| --- | --- | --- |
| slack channels list | List conversations. | --type TYPE, --exclude-archived, --page-size N, --cursor TOKEN, --all, --max-items N |
| slack channels get CHANNEL_ID | Get one conversation. | None |
| slack channels mark CHANNEL_ID TS | Move the read cursor of a conversation to a message. | --yes, --dry-run |
| slack channels members list CHANNEL_ID | List the member user IDs of a conversation. | --page-size N, --cursor TOKEN, --all, --max-items N |

### files

| Command | Description | Options |
| --- | --- | --- |
| slack files list | List files. | --channel CHANNEL_ID, --user USER_ID, --type TYPE, --page-size N, --cursor TOKEN, --all, --max-items N |
| slack files get FILE_ID | Get one file. | None |

### messages

| Command | Description | Options |
| --- | --- | --- |
| slack messages list CHANNEL_ID | List messages in a conversation. | --oldest DATE, --latest DATE, --page-size N, --cursor TOKEN, --all, --max-items N |
| slack messages get CHANNEL_ID TS | Get one message by conversation ID and ts. | None |
| slack messages search QUERY | Search messages. | --sort FIELD, --sort-dir DIRECTION, --page-size N, --cursor TOKEN, --all, --max-items N |
| slack messages update CHANNEL_ID TS | Replace the text of a message. | --text TEXT, --yes, --dry-run |
| slack messages delete CHANNEL_ID TS | Delete a message. | --yes, --dry-run |
| slack messages send CHANNEL_ID | Post a message to a conversation. | --text TEXT, --file PATH, --yes, --dry-run |
| slack messages reply CHANNEL_ID TS | Post a reply in the thread of a message. | --text TEXT, --yes, --dry-run |
| slack messages schedule CHANNEL_ID | Schedule a message for later. | --text TEXT, --at DATETIME, --yes, --dry-run |
| slack messages replies list CHANNEL_ID TS | List a thread: the parent message and its replies. | --page-size N, --cursor TOKEN, --all, --max-items N |

### permalinks

| Command | Description | Options |
| --- | --- | --- |
| slack permalinks get PERMALINK | Get the message a permalink points to. | None |

### pins

| Command | Description | Options |
| --- | --- | --- |
| slack pins list CHANNEL_ID | List the pinned items of a conversation. | None |
| slack pins add CHANNEL_ID TS | Pin a message. | --yes, --dry-run |
| slack pins remove CHANNEL_ID TS | Unpin a message. | --yes, --dry-run |

### reactions

| Command | Description | Options |
| --- | --- | --- |
| slack reactions list CHANNEL_ID TS | List the reactions on a message. | None |
| slack reactions add CHANNEL_ID TS EMOJI | Add a reaction to a message. | --yes, --dry-run |
| slack reactions remove CHANNEL_ID TS EMOJI | Remove a reaction from a message. | --yes, --dry-run |

### scheduled-messages

| Command | Description | Options |
| --- | --- | --- |
| slack scheduled-messages list | List scheduled messages. | --channel CHANNEL_ID, --page-size N, --cursor TOKEN, --all, --max-items N |
| slack scheduled-messages delete CHANNEL_ID SCHEDULED_MESSAGE_ID | Delete a scheduled message before Slack posts it. | --yes, --dry-run |

### usergroups

| Command | Description | Options |
| --- | --- | --- |
| slack usergroups list | List user groups. | --include-disabled, --include-users, --include-count |

### users

| Command | Description | Options |
| --- | --- | --- |
| slack users list | List users in the workspace. | --page-size N, --cursor TOKEN, --all, --max-items N |
| slack users get USER_ID | Get one user. | None |
| slack users lookup EMAIL | Get one user by email address. | None |

### setup

| Command | Description | Options |
| --- | --- | --- |
| slack setup [NAME] | Create and activate a profile. | --token-file PATH, --base-url URL, --access ACCESS |

### profiles

| Command | Description | Options |
| --- | --- | --- |
| slack profiles list | List saved profiles. | None |
| slack profiles get NAME | Get one saved profile with secrets redacted. | None |
| slack profiles create NAME | Create a profile without activating it. | --token-file PATH, --base-url URL, --access ACCESS |
| slack profiles update NAME | Update fields of a profile. | --token-file PATH, --base-url URL, --clear-base-url, --access ACCESS |
| slack profiles delete NAME | Delete a profile. | None |
| slack profiles use NAME | Make a profile the active profile. | None |

### config

| Command | Description | Options |
| --- | --- | --- |
| slack config list | List every configuration key. | None |
| slack config get KEY | Get one configuration value. | None |
| slack config path | Get the configuration paths. | None |

### auth

| Command | Description | Options |
| --- | --- | --- |
| slack auth verify | Verify the user token. | None |

### api

| Command | Description | Options |
| --- | --- | --- |
| slack api request METHOD PATH | Send a raw API request. | --query KEY=VALUE, --file PATH, --yes, --dry-run |

### completions

| Command | Description | Options |
| --- | --- | --- |
| slack completions SHELL | Print a shell completion script. | None |

## Global options

| Option | Description |
| --- | --- |
| -h, --help | Show help. Uses no credentials or network. |
| --version | Print the executable name and version. |
| --profile NAME | Select a saved profile. |
| --format FORMAT | Output format. Allowed: json, pretty, human. Default: human. |
| --color WHEN | Color for pretty and human output. Allowed: auto, always, never. Default: auto. |
| -q, --quiet | Suppress progress and notices. Results and errors still print. |
| -v, --verbose | Print redacted diagnostics to stderr. |
| --no-input | Never prompt. Fail when input is missing. |
| --timeout DURATION | Per-request timeout in ms, s, or m, from 1ms to 10m. Default: 30s. |

Network commands (the resource commands, `auth verify`, and `api request`) accept every option except `--version`. Local commands (`setup`, `profiles`, and `config`) accept `--help`, `--format`, `--color`, `--quiet`, `--verbose`, and `--no-input`. `completions` accepts only `--help`. With no command, only `--help`, `--version`, `--verbose`, and `--quiet` apply, and `--version` with a command word fails.

## Authentication

The CLI authenticates with a Slack user token (`xoxp-...`) from a Slack app that you create in your workspace. A user token acts as the user who installs the app and sees what that user sees; `messages search` works only with a user token. Bot tokens (`xoxb-...`) are rejected.

The manifest below requests user token scopes only, split into a read set and a write set. For a read-only app, delete the write set lines before you paste it.

```yaml
display_information:
  name: slack-cli
  description: Command-line access to Slack for one user.
oauth_config:
  scopes:
    user:
      # Read set: every read command except scheduled-messages list (see the table).
      - channels:read
      - groups:read
      - im:read
      - mpim:read
      - channels:history
      - groups:history
      - im:history
      - mpim:history
      - users:read
      - users:read.email
      - search:read
      - files:read
      - reactions:read
      - pins:read
      - usergroups:read
      # Write set: messages, reactions, pins, and channels mark. It also lets scheduled-messages list work.
      - chat:write
      - reactions:write
      - pins:write
      - channels:write
      - groups:write
      - im:write
      - mpim:write
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

| Scopes | Commands |
| --- | --- |
| `channels:read`, `groups:read`, `im:read`, `mpim:read` | `channels list`, `channels get`, `channels members list` for public channels, private channels, direct messages, and group direct messages. |
| `channels:history`, `groups:history`, `im:history`, `mpim:history` | `messages list`, `messages get`, `messages replies list`, `permalinks get`. |
| `users:read`, `users:read.email` | `users list`, `users get`, `users lookup` (needs `users:read.email`). |
| `search:read` | `messages search`. |
| `files:read`, `reactions:read`, `pins:read`, `usergroups:read` | `files list` and `get`, `reactions list`, `pins list`, `usergroups list`. |
| `chat:write` | `messages send`, `reply`, `update`, `delete`, `schedule`, and `scheduled-messages delete`. Slack also gates `scheduled-messages list` behind this scope, so a read-only profile that needs that command must grant it, and `--access read` still blocks every write. Without it, the command fails with `PERMISSION_DENIED` and names the scope. |
| `reactions:write`, `pins:write` | `reactions add` and `remove`, `pins add` and `remove`. |
| `channels:write`, `groups:write`, `im:write`, `mpim:write` | `channels mark`. |

1. Open [api.slack.com/apps](https://api.slack.com/apps) and choose **Create New App**, then **From a manifest**.
2. Pick the workspace, choose the **YAML** tab, paste the manifest, choose **Next**, then **Create**.
3. Open **OAuth & Permissions** (or **Install App**) and choose **Install to Workspace**, then **Allow**. A workspace that restricts apps sends the install to an admin for approval first.
4. On **OAuth & Permissions**, copy the **User OAuth Token**. It starts with `xoxp-`.
5. Run `slack setup` (below) and paste the token at the hidden prompt, or save it to a file only you can read and pass `--token-file PATH`.

To change scopes later, edit the manifest under **App Manifest**, then reinstall the app; reinstalling issues a token with the new scopes.

Every profile stores an access level, `read` or `write`, and `setup` and `profiles create` require it; there is no default. With `read`, every mutation fails with `PERMISSION_DENIED` (exit 4) before anything is sent, `--dry-run` included, and the error names the profile and the command that allows mutations. With `write`, mutations run after confirmation. The access level is a local lock; the token's scopes are what Slack enforces. A read-only profile uses both: a token from an app with the read set only, and `--access read`.

```bash
# Read-only: an app with the read set only, and the local lock.
slack setup reader --access read
# Read-write: an app with both sets.
slack setup writer --access write --token-file ./slack-token.txt
# Check the identity and the scopes Slack reports for the token.
slack auth verify --profile reader
# Unlock a profile for mutations, or lock it again.
slack profiles update reader --access write
slack profiles update reader --access read
```

`setup [NAME]` creates a profile (default name: `default`) and makes it the active profile. It fails when the profile exists. If activation fails after the profile is written, the profile stays saved and `setup` exits 8 with `PARTIAL_FAILURE`. In a terminal without `--no-input`, `setup` prompts for a missing user token with hidden input and for a missing access level. Without a terminal, a missing `--access` or token fails. Secrets are never command-line values: pass `--token-file PATH` (`-` reads stdin) or enter the token at the prompt.

Credentials and endpoint settings come only from a profile. No environment variable supplies them or selects a profile, so a scheduled job passes `--profile NAME` explicitly. Profile selection is `--profile NAME`, otherwise `activeProfile` in `config.json`. A selected or active profile that does not exist, and no profile at all, fail with `CONFIGURATION_ERROR` and no fallback. The hint points to `slack setup NAME` or `slack profiles use NAME`.

The CLI reads three environment variables, and none supplies credentials, endpoints, or a profile:

| Variable | Purpose |
| --- | --- |
| `XDG_CONFIG_HOME` | Configuration root when it is an absolute path. Otherwise `~/.config`. |
| `NO_COLOR` | Disables color with `--color auto` when set and nonempty. |
| `CI` | Disables prompts when nonempty and not `0` or `false`. |

Stored in the profile:

- User token: `token`, from the hidden prompt or `--token-file PATH`.
- Access level: `access`, `read` or `write`.
- Base URL: `baseUrl` in the profile, then `https://slack.com/api`.

`slack auth verify` sends `GET /auth.test`. Success proves that Slack accepted the user token, and `identity` names the user and the workspace (`url`, `team`, `team_id`, `user`, `user_id`). `identity.scopes` lists the scopes from the `x-oauth-scopes` response header, or `null` when Slack sends none. It does not prove complete permission coverage.

## Output and errors

The default output format is `human`: tables for collections and labeled fields for one resource, whatever the terminal. Nested objects and arrays inside one resource print as indented fields and lists, and a table cell shows a short summary such as a name or `N items`, never raw JSON. A dry run prints `dry_run` and `validation`, then each request on its own lines. `--format json` prints one compact, uncolored line on stdout with the envelope `{"data":...,"meta":{...}}`, and scripts and agents pass it explicitly. `--format pretty` prints the same document indented, with syntax highlighting when color applies. With `--format pretty` or the default `human` format and stderr on a terminal, a command that sends a request first prints one gray line, `Profile: NAME`, to stderr. `--quiet` suppresses it, and `--format json` never prints it. Errors go to stderr in the selected format, so the default error is the `human` text. Help, `--version`, and `completions` print plain text. The bare command and a command group with no action print the same help as `--help` on stdout, exit 0; an unknown action fails with exit 2.

`data` is an object for one resource, an array for a collection, or `null`, and keeps Slack's field names. Mutations print Slack's response without its envelope keys (`ok`, `warning`, `response_metadata`), and `null` when nothing else remains, as for `reactions add`. `meta` is always present.

| `meta` key | When |
| --- | --- |
| `profile` | Every command that sends a request. The name of the profile that served it. |
| `next_cursor` | Paginated collection reads. A string, or `null` when no page remains. |
| `has_more` | Paginated collection reads. |
| `provider` | `total` for `files list` and `messages search`, and Slack warnings on any response: `warning` (Slack's comma-separated string) and `warnings` (from `response_metadata.warnings`). Human output also prints each warning to stderr as a `Warning:` line, and `--quiet` suppresses it. |
| `dry_run`, `validation` | Dry-run previews. `validation` is `local`. |

Slack answers most failures with HTTP 200 and `{"ok":false,"error":"..."}`. The CLI treats that body as a failure and keeps the Slack error string in `error.provider.code`. `x-slack-req-id` is the request ID.

| Slack error | Error code |
| --- | --- |
| `invalid_auth`, `not_authed`, `token_revoked`, `token_expired`, `account_inactive` | `AUTHENTICATION_FAILED` |
| `missing_scope`, `not_allowed_token_type`, `restricted_action`, `no_permission`, `not_in_channel`, `cant_delete_message`, `cant_update_message` | `PERMISSION_DENIED` |
| `channel_not_found`, `user_not_found`, `users_not_found`, `message_not_found`, `thread_not_found`, `file_not_found`, `no_reaction`, `no_pin`, `invalid_scheduled_message_id` | `NOT_FOUND` |
| `already_reacted`, `already_pinned` | `CONFLICT` |
| `ratelimited`, `rate_limited`, and HTTP 429 | `RATE_LIMITED` |
| `invalid_arguments`, `invalid_cursor`, `invalid_limit`, `invalid_ts_latest`, `invalid_ts_oldest`, `invalid_name`, `invalid_blocks`, `msg_too_long`, `no_text`, `time_in_past`, `time_too_far`, and other input errors | `INVALID_REQUEST` |
| `internal_error`, `fatal_error`, `service_unavailable`, `request_timeout`, and HTTP 500, 502, 503, 504 | `TRANSIENT_FAILURE` |
| Any other error string | `PROVIDER_ERROR` |

For `missing_scope`, the message names the scope Slack needs and the scopes the token has, for example `Slack rejected the request: missing_scope: the token needs scope chat:write and has channels:read,users:read (HTTP 200).` Add the scope to the app and reinstall it (see Authentication).

With `--format json`, errors print one compact document on stderr, for example `{"error":{"code":"PERMISSION_DENIED","message":"...","hint":"...","retryable":false,"provider":{"status":200,"code":"missing_scope","request_id":"..."}}}`. Optional keys are `hint`, `outcome` (`unknown` when a mutation may have applied), `provider` (`status`, `code`, `request_id`, `retry_after_seconds`), `details`, and `partial`. The default `human` format prints `Error [CODE]: message` and `Hint: ...`.

| Exit | Error codes |
| --- | --- |
| 0 | Success, including empty collections. |
| 1 | `UNEXPECTED_ERROR`, `PROVIDER_ERROR`, `INVALID_RESPONSE`, `UNSUPPORTED_RESPONSE` |
| 2 | `INVALID_ARGUMENT`, `INVALID_REQUEST` |
| 3 | `CONFIGURATION_ERROR`, `AUTHENTICATION_REQUIRED`, `AUTHENTICATION_FAILED` |
| 4 | `PERMISSION_DENIED` |
| 5 | `NOT_FOUND` |
| 6 | `CONFLICT` |
| 7 | `RATE_LIMITED`, `TRANSIENT_FAILURE` |
| 8 | `PARTIAL_FAILURE` |
| 9 | `CONFIRMATION_REQUIRED`, `CONFIRMATION_DECLINED` |
| 130 | `INTERRUPTED` |

IDs are opaque strings. Slack identifies a message by its conversation ID and its `ts`, so message commands take `CHANNEL_ID TS`. `permalinks get` reads the conversation ID, `ts`, and `thread_ts` from a message link without a request. Options accept `--name value` and `--name=value`, and `--` ends options. Dates accept `YYYY-MM-DD` (read as 00:00 UTC) and `YYYY-MM-DDTHH:MM:SS[.fff](Z|+HH:MM)`. `messages list --oldest` and `--latest` send Slack timestamps and are exclusive. `messages schedule --at` must be in the future, and Slack drops fractional seconds. Unknown commands, options, extra arguments, invalid values, and conflicting options fail with exit code 2 before any request.

Mutations (`messages send`, `reply`, `update`, `delete`, and `schedule`, `scheduled-messages delete`, `reactions add` and `remove`, `pins add` and `remove`, `channels mark`, and `api request`) need a profile with write access and confirmation. The CLI validates arguments first, then checks the profile's access level (exit 4 for read access, before anything is sent, `--dry-run` included), then resolves credentials (exit 3 when missing), then asks for confirmation. In a terminal, it shows the profile, operation, request, and effect, then prompts. `--yes` confirms without a prompt. With `--no-input`, a non-terminal stdin or stderr, or CI mode, a missing confirmation exits 9. Ctrl-C or end of input at a prompt exits 130 with `INTERRUPTED`. `--dry-run` prints a redacted preview of the request, with headers in the order `Authorization`, `Accept`, `Content-Type`, and sends nothing. It needs a profile but no stored credentials. Preview success does not guarantee that the request succeeds. Slack documents no way to restore a deleted message or a deleted scheduled message.

Reads make up to 3 attempts on HTTP 429, 500, 502, 503, 504, network errors, and timeouts, waiting 250 ms, then 500 ms, or the `Retry-After` value up to 10 seconds. A `Retry-After` above 10 seconds is not waited on: the command fails with `RATE_LIMITED` and `provider.retry_after_seconds`. A Slack failure inside an HTTP 200 body, such as `ratelimited` or `internal_error`, fails at once without a retry; `retryable` is true for reads. Mutations make one attempt. `--timeout` applies to each attempt. `--verbose` writes redacted request, response, and retry diagnostics to stderr.

## Pagination

Paginated commands fetch one page by default. `--page-size` defaults to 100. Its limit is 999 for `channels list`, `channels members list`, `messages list`, and `messages replies list`, and 100 for `messages search`, as Slack documents. Slack documents no hard limit for `users list` (it recommends 200 or fewer), `files list`, and `scheduled-messages list`, so this tool caps them at 200, 100, and 100. `messages list` returns the newest messages first, `messages replies list` returns the thread parent first and then the replies oldest first, and `files list` returns the newest files first. For other collections the CLI keeps Slack's order and never sorts.

`--all` follows every cursor. `--max-items N` (with `--all`) shrinks the last request so the read stops on a page boundary, and `meta.next_cursor` resumes it. `--cursor TOKEN` resumes from a previous `meta.next_cursor`, with or without `--all`.

```bash
slack messages list C08A1B2C3D4 --all --max-items 500 --format json > history.json
slack messages list C08A1B2C3D4 --all --cursor "$(jq -r '.meta.next_cursor' history.json)" --format json
```

Most commands use Slack's cursors: the CLI passes `response_metadata.next_cursor` through unchanged, and an empty cursor ends the read. Slack can return fewer items than requested, or none, while a next cursor remains, because it filters after paging; `--all` keeps reading. `files list` and `messages search` page by number, so their cursor is the decimal offset of the first unread item. Slack serves at most 100 pages of search results, so a search that reaches that limit ends with `has_more` true and a null `next_cursor`. A request whose offset cannot fall on a page boundary within that limit fails with `INVALID_ARGUMENT`, or with `PARTIAL_FAILURE` and a resumable cursor after earlier pages, for example `--all --max-items 101` with `--page-size 100`; use a larger `--page-size` or `--max-items`.

A repeated cursor, an oversized page, or a repeated page of a numbered read on the first page fails with `INVALID_RESPONSE` and exit 1. A failure on a later page exits 8 with `PARTIAL_FAILURE`. The items read so far are in `error.partial.data`, `error.partial.next_cursor` points at the first unread item, and `error.details.cause` names the underlying error code, such as `INVALID_RESPONSE`. `pins list`, `reactions list`, and `usergroups list` are unpaginated: Slack returns the full list in one response and meta has only profile.

## Raw API access

```bash
slack api request POST /conversations.info --query channel=C08A1B2C3D4 --yes
slack api request POST /chat.postMessage --file ./message.json --dry-run
```

`PATH` is a Web API method, such as `/chat.postMessage`, sent to the base URL plus the path (`https://slack.com/api/chat.postMessage`). The only method is `POST`. Slack also accepts `GET` for methods that change state, so the CLI cannot tell a raw read from a raw write by its HTTP method: every raw request is a mutation that needs a profile with write access and confirmation, a read included. Use the first-class commands with a read-only profile. Pass arguments as repeatable `--query KEY=VALUE`, which Slack accepts for every method, or as a JSON body with `--file PATH`, sent as `application/json; charset=utf-8` (`-` reads stdin); Slack accepts JSON bodies only for methods that change state. `PATH` starts with a single `/` and has no scheme, host, query string, fragment, whitespace, or `.` and `..` segments. The CLI sends the selected profile's user token as a bearer token only to the configured API origin. JSON responses print as parsed, other text prints as a JSON string, an empty body prints `null`, and binary responses fail with `UNSUPPORTED_RESPONSE`. Non-2xx responses use the same error mapping as other commands. A Slack failure inside an HTTP 200 body is printed to stdout as Slack sent it, with `ok` false, and the command then fails with the same error mapping as other commands: the error goes to stderr and the exit code is the mapped one, such as 4 for `missing_scope`. A mutation that Slack rejected this way did not apply, but a mutation that times out may have.

## Configuration

Files live in `$XDG_CONFIG_HOME/slack` when `XDG_CONFIG_HOME` is an absolute path, and in `~/.config/slack` otherwise.

```text
slack/
  config.json            {"activeProfile": "work"}
  profiles/NAME.json     {"token": "xoxp-...", "baseUrl": "https://...", "access": "read"}
```

Keys are camelCase. Files use mode `0600`, directories use mode `0700`, and writes are atomic: the CLI creates a temporary file exclusively with mode `0600` in the same directory, then renames it. Reads reject unknown keys and non-object JSON with `CONFIGURATION_ERROR`. Profile names match `^[A-Za-z0-9._-]+$` and are not `.` or `..`. `config.json` holds one key, `activeProfile` (read-only through `config`; change it with `profiles use`). Credentials and endpoint settings live only in profile files, and a `config.json` with any other key fails with `CONFIGURATION_ERROR`. Profile fields: `token`, `baseUrl`, and `access` (`read` or `write`). A profile without `access`, such as one written by hand, can read, and its mutations fail with `CONFIGURATION_ERROR` until `profiles update NAME --access read|write` sets it. Secrets are redacted in previews, diagnostics, `profiles get`, and `config list`.

A base URL, from `--base-url` or a stored file, must be an `https` URL (`http` only for `localhost`, `127.0.0.1`, or `::1`) with no credentials, query string, or fragment. It may carry a path, and requests go to the base URL plus the Web API method. Values are stored unchanged.

Completion scripts come from `slack completions bash|zsh|fish` and read only the command registry and local profile names. They complete commands, options, enum values (after `--OPT ` and `--OPT=`), `METHOD`, `SHELL`, and profile names (after `--profile` and for the `NAME` argument of `profiles get|update|delete|use`). They offer nothing after `--` or after an option that takes a free-form value.

## Exceptions

| Rule | Decision | Reason |
| --- | --- | --- |
| `CLI-GRAM-4` | `messages reply`, `messages schedule`, `users lookup`, `reactions add`, `reactions remove`, `pins add`, `pins remove`, and `channels mark` are domain actions. | Each keeps the Slack term: reply in thread, `chat.scheduleMessage`, `users.lookupByEmail`, `reactions.add`, `reactions.remove`, `pins.add`, `pins.remove`, and `conversations.mark`. |
| `CLI-GRAM-6` | Message commands take `CHANNEL_ID TS` as positionals, `reactions add` and `remove` also take `EMOJI`, and `scheduled-messages delete` takes `CHANNEL_ID SCHEDULED_MESSAGE_ID`. | Slack identifies a message, and a scheduled message, by its conversation ID and its own ID together; neither alone names it. |
| `STYLE-API-1` | `api request` accepts `POST` only, and `PATH` is a Web API method. | The Web API serves every method at `/api/<method>` and accepts `GET` for methods that change state too, so a raw `GET` could not be treated as a read without bypassing confirmation and the read-only lock. |
| `STYLE-OUT-2` | `meta.provider` also carries Slack warnings (`warning`, `warnings`) on any response, single resources and mutations included. | Slack reports deprecations and malformed input as warnings on successful responses, and dropping them would hide them. |
| `STYLE-PAGE-1` | The `--page-size` limits of `users list` (200), `files list` (100), and `scheduled-messages list` (100) are set by this tool. | Slack documents no hard limit for these methods; it recommends 200 or fewer for `users.list`. |

## Development

```bash
bun run build
bun run check
bun link
```

`src/core/` is vendored from cli-core and is never edited here. Change cli-core and run its sync script instead. `docs/cli-conventions.md` restates the command-line contract this tool follows.

## API references

- [Slack Web API](https://docs.slack.dev/apis/web-api/)
- [App manifests](https://docs.slack.dev/reference/app-manifest)
- [Scopes](https://docs.slack.dev/reference/scopes)
- [Pagination](https://docs.slack.dev/apis/web-api/pagination)
- [Rate limits](https://docs.slack.dev/apis/web-api/rate-limits)
- [auth.test](https://docs.slack.dev/reference/methods/auth.test)
- [conversations.list](https://docs.slack.dev/reference/methods/conversations.list)
- [conversations.history](https://docs.slack.dev/reference/methods/conversations.history)
- [conversations.replies](https://docs.slack.dev/reference/methods/conversations.replies)
- [search.messages](https://docs.slack.dev/reference/methods/search.messages)
- [chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage)
- [chat.scheduleMessage](https://docs.slack.dev/reference/methods/chat.scheduleMessage)
- [chat.delete](https://docs.slack.dev/reference/methods/chat.delete)
