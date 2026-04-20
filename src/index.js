/**
 * Cloudflare Email Worker: catch-all forward + thread token for reply routing.
 *
 * - Adds X-NB-Original-Recipient (or RECIPIENT_HEADER_NAME) = envelope recipient.
 * - Writes JSON to KV: { orig_from, reply_as, message_id?, created_at } with TTL 30d.
 * - Sets Reply-To: reply+<token>@<REPLY_DOMAIN> so replies can be correlated server-side.
 */

function randomToken() {
	const bytes = new Uint8Array(18);
	crypto.getRandomValues(bytes);
	let s = "";
	for (let i = 0; i < bytes.length; i++) {
		s += String.fromCharCode(bytes[i]);
	}
	// URL-safe base64 without padding
	const b64 = btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return b64;
}

export default {
	async fetch() {
		return new Response("Hello World!");
	},

	async email(message, env, ctx) {
		const defaultHeaderName = "X-NB-Original-Recipient";
		const configuredHeaderName =
			typeof env.RECIPIENT_HEADER_NAME === "string"
				? env.RECIPIENT_HEADER_NAME.trim()
				: "";
		const headerName =
			configuredHeaderName && configuredHeaderName.startsWith("X-")
				? configuredHeaderName
				: defaultHeaderName;

		const headers = new Headers();
		headers.set(headerName, message.to);

		if (!env.FORWARD_TO) {
			message.setReject("Missing FORWARD_TO destination");
			return;
		}

		const replyDomain =
			typeof env.REPLY_DOMAIN === "string" ? env.REPLY_DOMAIN.trim() : "";
		const kv = env.NB_KV;

		if (kv && replyDomain) {
			const token = randomToken();
			const messageId =
				typeof message.headers?.get === "function"
					? (message.headers.get("Message-Id") || message.headers.get("Message-ID") || "")
					: "";

			const payload = {
				orig_from: message.from || "",
				reply_as: message.to || "",
				message_id: messageId,
				created_at: Date.now(),
			};

			const ttlSeconds =
				typeof env.NB_KV_TTL_SECONDS === "string"
					? parseInt(env.NB_KV_TTL_SECONDS, 10)
					: typeof env.NB_KV_TTL_SECONDS === "number"
						? env.NB_KV_TTL_SECONDS
						: 60 * 60 * 24 * 30;

			try {
				await kv.put(token, JSON.stringify(payload), {
					expirationTtl: Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 60 * 60 * 24 * 30,
				});
			} catch (e) {
				message.setReject(`NB_KV put failed: ${e && e.message ? e.message : String(e)}`);
				return;
			}

			const replyAddr = `reply+${token}@${replyDomain}`;
			const existingReplyTo =
				typeof message.headers?.get === "function"
					? (message.headers.get("Reply-To") || "").trim()
					: "";
			if (existingReplyTo) {
				headers.set("X-Original-Reply-To", existingReplyTo);
			}
			headers.set("Reply-To", replyAddr);
			headers.set("X-NB-Thread-Token", token);
		}

		await message.forward(env.FORWARD_TO, headers);
	},
};
