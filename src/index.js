/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request, env, ctx) {
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

		await message.forward(env.FORWARD_TO, headers);
	},
};
