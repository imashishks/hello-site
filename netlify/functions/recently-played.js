exports.handler = async (event) => {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } =
    process.env;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    // 1. Get fresh access token
    const tokenResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`,
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: SPOTIFY_REFRESH_TOKEN,
        }),
      },
    );

    const { access_token } = await tokenResponse.json();

    // 2. Fetch recently played
    const limit = event.queryStringParameters?.limit || 10;
    const recentResponse = await fetch(
      `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );

    async function getPreviewUrl(trackId) {
      try {
        const res = await fetch(
          `https://open.spotify.com/embed/track/${trackId}`,
        );
        const html = await res.text();

        const match = html.match(
          /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/,
        );
        if (!match) return null;

        const data = JSON.parse(match[1]);
        return (
          data?.props?.pageProps?.state?.data?.entity?.audioPreview?.url ?? null
        );
      } catch {
        return null;
      }
    }
    const data = await recentResponse.json();

    const tracks = await Promise.all(
      data.items.map(async (item) => {
        const previewUrl = await getPreviewUrl(item.track.id);
        return {
          name: item.track.name,
          artist: item.track.artists.map((a) => a.name).join(", "),
          album: item.track.album.name,
          albumArt: item.track.album.images[0]?.url,
          playedAt: item.played_at,
          spotifyUrl: item.track.external_urls.spotify,
          previewUrl,
          item,
        };
      }),
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ tracks, total: tracks.length }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
