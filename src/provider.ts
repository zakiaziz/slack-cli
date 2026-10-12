import type { ErrorCode } from "./core/errors.js";
import type { HookHelpers, PageInfo, Provider, ProviderErrorDetail } from "./core/provider.js";
import { isRecord } from "./core/values.js";
import { commands, groups } from "./registry.js";

/** Slack error strings and the error codes they map to. Unlisted strings fall back to PROVIDER_ERROR. */
const ERROR_CODES: Readonly<Record<string, ErrorCode>> = {
  invalid_auth: "AUTHENTICATION_FAILED",
  not_authed: "AUTHENTICATION_FAILED",
  token_revoked: "AUTHENTICATION_FAILED",
  token_expired: "AUTHENTICATION_FAILED",
  account_inactive: "AUTHENTICATION_FAILED",
  missing_scope: "PERMISSION_DENIED",
  not_allowed_token_type: "PERMISSION_DENIED",
  restricted_action: "PERMISSION_DENIED",
  no_permission: "PERMISSION_DENIED",
  not_in_channel: "PERMISSION_DENIED",
  cant_delete_message: "PERMISSION_DENIED",
  cant_update_message: "PERMISSION_DENIED",
  channel_not_found: "NOT_FOUND",
  user_not_found: "NOT_FOUND",
  users_not_found: "NOT_FOUND",
  message_not_found: "NOT_FOUND",
  thread_not_found: "NOT_FOUND",
  file_not_found: "NOT_FOUND",
  no_reaction: "NOT_FOUND",
  no_pin: "NOT_FOUND",
  invalid_scheduled_message_id: "NOT_FOUND",
  already_reacted: "CONFLICT",
  already_pinned: "CONFLICT",
  ratelimited: "RATE_LIMITED",
  rate_limited: "RATE_LIMITED",
  invalid_arguments: "INVALID_REQUEST",
  invalid_arg_name: "INVALID_REQUEST",
  invalid_array_arg: "INVALID_REQUEST",
  invalid_charset: "INVALID_REQUEST",
  invalid_form_data: "INVALID_REQUEST",
  invalid_json: "INVALID_REQUEST",
  json_not_object: "INVALID_REQUEST",
  invalid_post_type: "INVALID_REQUEST",
  missing_post_type: "INVALID_REQUEST",
  invalid_cursor: "INVALID_REQUEST",
  invalid_limit: "INVALID_REQUEST",
  invalid_ts_latest: "INVALID_REQUEST",
  invalid_ts_oldest: "INVALID_REQUEST",
  invalid_timestamp: "INVALID_REQUEST",
  bad_timestamp: "INVALID_REQUEST",
  invalid_name: "INVALID_REQUEST",
  invalid_email: "INVALID_REQUEST",
  invalid_blocks: "INVALID_REQUEST",
  invalid_blocks_format: "INVALID_REQUEST",
  invalid_attachments: "INVALID_REQUEST",
  too_many_attachments: "INVALID_REQUEST",
  msg_too_long: "INVALID_REQUEST",
  no_text: "INVALID_REQUEST",
  time_in_past: "INVALID_REQUEST",
  time_too_far: "INVALID_REQUEST",
  invalid_time: "INVALID_REQUEST",
  internal_error: "TRANSIENT_FAILURE",
  fatal_error: "TRANSIENT_FAILURE",
  service_unavailable: "TRANSIENT_FAILURE",
  request_timeout: "TRANSIENT_FAILURE",
};

export const provider: Provider = {
  bin: "slack",
  name: "Slack",
  secrets: [{ key: "token", label: "user token", validate: userTokenConstraint }],
  authScheme: "a bearer token",
  authorize: (credential) => ({ Authorization: `Bearer ${credential.token}` }),
  jsonContentType: "application/json; charset=utf-8",
  baseUrl: { default: "https://slack.com/api", allowPath: true, joinPath: true },
  accessLevels: true,
  requestIdHeader: "x-slack-req-id",
  errorDetail,
  bodyFailure: (body) => (isRecord(body) && body.ok === false ? errorDetail(body) : undefined),
  responseMeta: notices,
  errorCodes: ERROR_CODES,
  pagination: {
    allowEmptyPages: true,
    apply({ query }, page) {
      query.set("limit", String(page.size));
      if (page.cursor === null) query.delete("cursor");
      else query.set("cursor", page.cursor);
    },
    read: readCursor,
  },
  verify: {
    method: "GET",
    path: "/auth.test",
    query: [],
    effect:
      "Sends GET /auth.test. Success proves that Slack accepted the user token, and identity names the user and the workspace. identity.scopes lists the scopes Slack reports for the token in the x-oauth-scopes response header, or null when Slack sends none. It does not prove complete permission coverage.",
    identity,
  },
  api: {
    methods: ["POST"],
    examples: [
      "slack api request POST /conversations.info --query channel=C08A1B2C3D4 --yes",
      "slack api request POST /chat.postMessage --file ./message.json --dry-run",
    ],
    exceptions: [
      {
        rule: "STYLE-API-1",
        reason:
          "POST only. Slack accepts GET for methods that change state too, so a raw GET could not be classified as a read; every raw request needs confirmation and write access. PATH is a Web API method, such as /chat.postMessage.",
      },
    ],
  },
  groups,
  commands,
};

function userTokenConstraint(value: string): string | undefined {
  if (!/^[!-~]+$/.test(value)) return "contain only visible ASCII characters without spaces";
  if (!/^(?:xoxe\.)?xoxp-/.test(value)) return "be a Slack user token that starts with xoxp-";
  return undefined;
}

/** Slack reports failures as { ok: false, error }, with needed and provided scopes for missing_scope. */
function errorDetail(body: unknown): ProviderErrorDetail {
  if (!isRecord(body)) return {};
  const code = typeof body.error === "string" && body.error !== "" ? body.error : undefined;
  const parts = code === undefined ? [] : [code];
  if (typeof body.needed === "string" && body.needed !== "") {
    const provided = typeof body.provided === "string" && body.provided !== "" ? body.provided : "none";
    parts.push(`the token needs scope ${body.needed} and has ${provided}`);
  }
  const metadata = isRecord(body.response_metadata) ? body.response_metadata : undefined;
  const messages = Array.isArray(metadata?.messages) ? metadata.messages.filter((item): item is string => typeof item === "string") : [];
  const message = [parts.join(": "), ...messages].filter((part) => part !== "").join("; ");
  return { ...(message === "" ? {} : { message }), ...(code === undefined ? {} : { code }) };
}

/** Slack warnings that any response can carry: warning (comma-separated) and response_metadata.warnings. */
function notices(body: unknown): Record<string, unknown> | undefined {
  if (!isRecord(body)) return undefined;
  const warning = typeof body.warning === "string" && body.warning !== "" ? body.warning : undefined;
  const metadata = isRecord(body.response_metadata) ? body.response_metadata : undefined;
  const warnings = Array.isArray(metadata?.warnings) ? metadata.warnings.filter((item): item is string => typeof item === "string") : [];
  return { ...(warning === undefined ? {} : { warning }), ...(warnings.length > 0 ? { warnings } : {}) };
}

/** response_metadata.next_cursor continues the read; an empty or missing cursor ends it. */
function readCursor(payload: unknown): PageInfo | undefined {
  if (!isRecord(payload)) return undefined;
  const metadata = payload.response_metadata;
  if (metadata === undefined) return { nextCursor: null };
  if (!isRecord(metadata)) return undefined;
  const next = metadata.next_cursor;
  if (next === undefined || next === "") return { nextCursor: null };
  if (typeof next !== "string") return undefined;
  return { nextCursor: next };
}

function identity(data: unknown, helpers: HookHelpers): unknown {
  const body = isRecord(data) ? data : {};
  const keys = ["url", "team", "team_id", "user", "user_id", "enterprise_id"];
  const found = Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
  const header = helpers.header("x-oauth-scopes");
  const scopes = header === undefined ? null : header.split(",").map((scope) => scope.trim()).filter((scope) => scope !== "");
  return { ...found, scopes };
}
