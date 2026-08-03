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

const { repositories, contributionsCollection } = payload.data.user;
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

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="860" height="320" viewBox="0 0 860 320" role="img" aria-labelledby="title description">
  <title id="title">${username}'s contribution activity</title>
  <desc id="description">A GitHub contribution heatmap for the past year with contribution, streak, and repository totals. Updated ${updatedAt} UTC.</desc>
  <rect width="860" height="320" fill="#0d1117"/>
  <rect x="0.5" y="0.5" width="859" height="319" fill="none" stroke="#30363d"/>
  <rect x="24" y="24" width="5" height="42" fill="#39d353"/>
  <text x="42" y="44" fill="#f0f6fc" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="21" font-weight="600">Contribution Activity</text>
  <text x="42" y="64" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12">Past 12 months · refreshed ${updatedAt} UTC</text>
  <line x1="24" y1="88" x2="836" y2="88" stroke="#30363d"/>
  <text x="24" y="112" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11" font-weight="600">CONTRIBUTIONS</text>
  <text x="24" y="144" fill="#f0f6fc" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="27" font-weight="700">${calendar.totalContributions}</text>
  <text x="230" y="112" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11" font-weight="600">CURRENT STREAK</text>
  <text x="230" y="144" fill="#f0f6fc" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="27" font-weight="700">${currentStreak} days</text>
  <text x="436" y="112" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11" font-weight="600">LONGEST STREAK</text>
  <text x="436" y="144" fill="#f0f6fc" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="27" font-weight="700">${longestStreak} days</text>
  <text x="650" y="112" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11" font-weight="600">PUBLIC REPOS</text>
  <text x="650" y="144" fill="#f0f6fc" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="27" font-weight="700">${repositories.totalCount}</text>
  <text x="58" y="195" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10">Sun</text>
  <text x="58" y="221" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10">Tue</text>
  <text x="58" y="247" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10">Thu</text>
  ${monthLabels.join("\n  ")}
  ${heatmap.join("\n  ")}
  <text x="620" y="290" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">Less</text>
  <rect x="654" y="280" width="10" height="10" rx="2" fill="#161b22"/>
  <rect x="668" y="280" width="10" height="10" rx="2" fill="#0e4429"/>
  <rect x="682" y="280" width="10" height="10" rx="2" fill="#006d32"/>
  <rect x="696" y="280" width="10" height="10" rx="2" fill="#26a641"/>
  <rect x="710" y="280" width="10" height="10" rx="2" fill="#39d353"/>
  <text x="730" y="290" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">More</text>
</svg>
`;

await writeFile("assets/github-stats.svg", svg, "utf8");