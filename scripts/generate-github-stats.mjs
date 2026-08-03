import { writeFile } from "node:fs/promises";

const username = process.env.GITHUB_USERNAME;
const token = process.env.GITHUB_TOKEN;

if (!username || !token) {
  throw new Error("GITHUB_USERNAME and GITHUB_TOKEN are required.");
}

const today = new Date();
const oneYearAgo = new Date(today);
oneYearAgo.setUTCFullYear(today.getUTCFullYear() - 1);

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: `query($username: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $username) {
        followers { totalCount }
        repositories(ownerAffiliations: OWNER, privacy: PUBLIC) { totalCount }
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar { totalContributions }
        }
      }
    }`,
    variables: {
      username,
      from: oneYearAgo.toISOString(),
      to: today.toISOString(),
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
if (payload.errors?.length || !payload.data?.user) {
  throw new Error(`GitHub API returned an invalid response: ${JSON.stringify(payload.errors)}`);
}

const { followers, repositories, contributionsCollection } = payload.data.user;
const updatedAt = today.toISOString().slice(0, 10);
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="184" viewBox="0 0 720 184" role="img" aria-labelledby="title description">
  <title id="title">${username}'s GitHub statistics</title>
  <desc id="description">GitHub contributions over the past year, public repositories, and followers. Updated ${updatedAt} UTC.</desc>
  <rect width="720" height="184" fill="#0d1117"/>
  <rect x="0.5" y="0.5" width="719" height="183" fill="none" stroke="#30363d"/>
  <text x="32" y="40" fill="#f0f6fc" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="22" font-weight="600">GitHub Stats</text>
  <text x="32" y="66" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="14">Updated ${updatedAt} UTC</text>
  <line x1="32" y1="86" x2="688" y2="86" stroke="#30363d"/>
  <text x="142" y="128" text-anchor="middle" fill="#58a6ff" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="32" font-weight="700">${contributionsCollection.contributionCalendar.totalContributions}</text>
  <text x="142" y="154" text-anchor="middle" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="14">Contributions (1 year)</text>
  <line x1="360" y1="104" x2="360" y2="160" stroke="#30363d"/>
  <text x="480" y="128" text-anchor="middle" fill="#58a6ff" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="32" font-weight="700">${repositories.totalCount}</text>
  <text x="480" y="154" text-anchor="middle" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="14">Public repositories</text>
  <text x="608" y="128" text-anchor="middle" fill="#58a6ff" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="32" font-weight="700">${followers.totalCount}</text>
  <text x="608" y="154" text-anchor="middle" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="14">Followers</text>
</svg>
`;

await writeFile("assets/github-stats.svg", svg, "utf8");