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
        publicRepositories: repositories(ownerAffiliations: OWNER, privacy: PUBLIC) { totalCount }
        highlightedRepositories: repositories(first: 3, orderBy: {field: STARGAZERS, direction: DESC}, ownerAffiliations: OWNER, privacy: PUBLIC) {
          nodes {
            name
            stargazerCount
            primaryLanguage { name color }
          }
        }
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                contributionLevel
                date
              }
            }
          }
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

const { publicRepositories, highlightedRepositories, contributionsCollection } = payload.data.user;
const updatedAt = today.toISOString().slice(0, 10);
const calendar = contributionsCollection.contributionCalendar;
const days = calendar.weeks.flatMap((week) => week.contributionDays);
const levelColors = {
  NONE: "#161b22",
  FIRST_QUARTILE: "#0e4429",
  SECOND_QUARTILE: "#006d32",
  THIRD_QUARTILE: "#26a641",
  FOURTH_QUARTILE: "#39d353",
};

let longestStreak = 0;
let runningStreak = 0;
for (const day of days) {
  if (day.contributionCount > 0) {
    runningStreak += 1;
    longestStreak = Math.max(longestStreak, runningStreak);
  } else {
    runningStreak = 0;
  }
}

let currentStreak = 0;
let activeDayIndex = days.length - 1;
if (days[activeDayIndex]?.contributionCount === 0) {
  activeDayIndex -= 1;
}
while (activeDayIndex >= 0 && days[activeDayIndex].contributionCount > 0) {
  currentStreak += 1;
  activeDayIndex -= 1;
}

const monthLabels = [];
let previousMonth = -1;
for (const [weekIndex, week] of calendar.weeks.entries()) {
  const monthStart = week.contributionDays.find((day) => day.date.endsWith("-01"));
  if (!monthStart) {
    continue;
  }

  const month = new Date(`${monthStart.date}T00:00:00Z`).getUTCMonth();
  if (month !== previousMonth) {
    monthLabels.push(`<text x="${100 + weekIndex * 14}" y="174" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">${new Date(`${monthStart.date}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</text>`);
    previousMonth = month;
  }
}

const heatmap = calendar.weeks.flatMap((week, weekIndex) =>
  week.contributionDays.map((day) => {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    return `<rect x="${100 + weekIndex * 14}" y="${184 + weekday * 13}" width="10" height="10" rx="2" fill="${levelColors[day.contributionLevel] ?? levelColors.NONE}"/>`;
  }),
);

const escapeXml = (value) => value.replace(/[<>&"']/g, (character) => ({
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "\"": "&quot;",
  "'": "&apos;",
})[character]);

const projectCards = highlightedRepositories.nodes.map((repository, index) => {
  const x = 24 + index * 302;
  const language = repository.primaryLanguage?.name ?? "Code";
  const languageColor = repository.primaryLanguage?.color ?? "#8b949e";
  return `<rect x="${x}" y="286" width="284" height="76" rx="6" fill="#161b22" stroke="#30363d"/>
  <circle cx="${x + 18}" cy="309" r="5" fill="${languageColor}"/>
  <text x="${x + 30}" y="314" fill="#f0f6fc" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13" font-weight="600">${escapeXml(repository.name)}</text>
  <text x="${x + 18}" y="342" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">${escapeXml(language)} · ${repository.stargazerCount} stars</text>`;
});

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="920" height="390" viewBox="0 0 920 390" role="img" aria-labelledby="title description">
  <title id="title">${username}'s code year</title>
  <desc id="description">A contribution calendar, coding streaks, and highlighted public repositories. Updated ${updatedAt} UTC.</desc>
  <rect width="920" height="390" fill="#0d1117"/>
  <rect x="0.5" y="0.5" width="919" height="389" fill="none" stroke="#30363d"/>
  <text x="24" y="32" fill="#39d353" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12" font-weight="700">// ${username.toUpperCase()}_CODE_YEAR</text>
  <text x="24" y="61" fill="#f0f6fc" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="24" font-weight="600">A year in commits</text>
  <text x="24" y="82" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12">${calendar.totalContributions} contributions across public work · refreshed ${updatedAt}</text>
  <text x="648" y="36" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10" font-weight="700">CURRENT STREAK</text>
  <text x="648" y="61" fill="#f0f6fc" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="22" font-weight="700">${currentStreak}d</text>
  <text x="750" y="36" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10" font-weight="700">LONGEST</text>
  <text x="750" y="61" fill="#f0f6fc" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="22" font-weight="700">${longestStreak}d</text>
  <text x="838" y="36" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10" font-weight="700">REPOS</text>
  <text x="838" y="61" fill="#f0f6fc" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="22" font-weight="700">${publicRepositories.totalCount}</text>
  <line x1="24" y1="102" x2="896" y2="102" stroke="#30363d"/>
  <text x="24" y="126" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11" font-weight="600">CONTRIBUTION CALENDAR</text>
  <text x="67" y="161" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10">Sun</text>
  <text x="67" y="187" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10">Tue</text>
  <text x="67" y="213" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10">Thu</text>
  ${monthLabels.join("\n  ")}
  ${heatmap.join("\n  ")}
  <text x="710" y="254" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">Less</text>
  <rect x="744" y="244" width="10" height="10" rx="2" fill="#161b22"/>
  <rect x="758" y="244" width="10" height="10" rx="2" fill="#0e4429"/>
  <rect x="772" y="244" width="10" height="10" rx="2" fill="#006d32"/>
  <rect x="786" y="244" width="10" height="10" rx="2" fill="#26a641"/>
  <rect x="800" y="244" width="10" height="10" rx="2" fill="#39d353"/>
  <text x="820" y="254" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">More</text>
  <text x="24" y="278" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11" font-weight="600">PROJECT INDEX</text>
  ${projectCards.join("\n  ")}
</svg>
`;

await writeFile("assets/github-stats.svg", svg, "utf8");