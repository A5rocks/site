// lewd name!
// https://docs.joinmastodon.org/spec/webfinger
export async function onRequest({ env, request }) {
	if (request.method !== "GET") {
		return new Response(
			"This webfinger implementaiton only supports `GET` requests.",
			{ status: 405 }
		);
	}

	const resource = (new URL(request.url)).searchParams.get('resource');
	if (!resource) {
		return new Response("Missing `resource` query parameter.", { status: 400 });
	}

	if (resource.toLowerCase() !== "acct:a5rocks@helvetica.moe") {
		return new Response("That user is not known!", { status: 404 });
	}

	return new Response(JSON.stringify({
		subject: "acct:A5rocks@uwu.social",
		aliases: [
			"https://uwu.social/@A5rocks",
			"https://uwu.social/users/@A5rocks",
		],
		links: [
			{
				rel: "http://webfinger.net/rel/profile-page",
				type: "text/html",
				href: "https://uwu.social/@A5rocks",
			},
			{
				rel: "self",
				type: "application/activity+json",
				href: "https://uwu.social/users/@A5rocks",
			},
			{
				rel: "http://ostatus.org/schema/1.0/subscribe",
				template: "https://uwu.social/authorize_interaction?uri={uri}",
			},
		],
	}), { status: 200, headers: { "Content-Type": "application/json" } });
}
