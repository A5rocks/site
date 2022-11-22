// lewd name!
// https://docs.joinmastodon.org/spec/webfinger

const redirects = {
	"acct:a5rocks@helvetica.moe": "acct:A5rocks@uwu.social"
};

export async function onRequest({ request }) {
	if (request.method !== "GET") {
		return new Response(
			"This webfinger implementation only supports `GET` requests.",
			{ status: 405 }
		);
	}

	const resource = (new URL(request.url)).searchParams.get('resource');
	if (!resource) {
		return new Response("Missing `resource` query parameter.", { status: 400 });
	}

	if (!Object.keys(redirects).includes(resource.toLowerCase())) {
		return new Response("That user is not known!", { status: 404 });
	}

	return new Response(JSON.stringify({
		// mastodon will treat this as a redirect
		subject: redirects[resource.toLowerCase()],
	}), { status: 200, headers: { "Content-Type": "application/json" } });
}
