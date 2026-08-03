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

const { publicRepositories, contributionsCollection } = payload.data.user;
const updatedAt = today.toISOString().slice(0, 10);
const calendar = contributionsCollection.contributionCalendar;
const days = calendar.weeks.flatMap((week) => week.contributionDays);

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

const chartLeft = 88;
const chartTop = 196;
const chartWidth = 780;
const chartHeight = 150;
const chartBottom = chartTop + chartHeight;
const weeklyTotals = calendar.weeks.map((week) => week.contributionDays.reduce(
  (total, day) => total + day.contributionCount,
  0,
));
const maxWeeklyContributions = Math.max(1, ...weeklyTotals);
const weekSpacing = chartWidth / Math.max(1, calendar.weeks.length - 1);
const chartPoints = weeklyTotals.map((total, index) => ({
  x: chartLeft + index * weekSpacing,
  y: chartBottom - (total / maxWeeklyContributions) * chartHeight,
  total,
  startDate: calendar.weeks[index].contributionDays[0]?.date ?? updatedAt,
}));
const linePoints = chartPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
const areaPoints = `${chartLeft},${chartBottom} ${linePoints} ${chartPoints.at(-1)?.x.toFixed(1)},${chartBottom}`;
const chartGrid = Array.from({ length: 5 }, (_, index) => {
  const value = Math.round(maxWeeklyContributions * (4 - index) / 4);
  const y = chartTop + index * (chartHeight / 4);
  return `<line x1="${chartLeft}" y1="${y}" x2="${chartLeft + chartWidth}" y2="${y}" stroke="#21262d" stroke-dasharray="3 4"/>
  <text x="${chartLeft - 12}" y="${y + 4}" text-anchor="end" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10">${value}</text>`;
});
const chartMarkers = chartPoints.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.5" fill="#8b949e" stroke="#0d1117" stroke-width="1.5"><title>Week of ${point.startDate}: ${point.total} contributions</title></circle>`);
const monthLabels = [];
let previousMonth = -1;
for (const [weekIndex, week] of calendar.weeks.entries()) {
  const monthStart = week.contributionDays.find((day) => day.date.endsWith("-01"));
  if (!monthStart) {
    continue;
  }

  const month = new Date(`${monthStart.date}T00:00:00Z`).getUTCMonth();
  if (month !== previousMonth) {
    monthLabels.push(`<text x="${chartLeft + weekIndex * weekSpacing}" y="178" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">${new Date(`${monthStart.date}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</text>`);
    previousMonth = month;
  }
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="920" height="405" viewBox="0 0 920 405" role="img" aria-labelledby="title description">
  <title id="title">${username}'s contribution activity</title>
  <desc id="description">A weekly contribution graph for the past year, with total contributions and coding streaks. Updated ${updatedAt} UTC.</desc>
  <rect width="920" height="405" fill="#0d1117"/>
  <rect x="0.5" y="0.5" width="919" height="404" fill="none" stroke="#30363d"/>
  <text x="24" y="36" fill="#f0f6fc" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="25" font-weight="600">Contribution activity</text>
  <text x="24" y="59" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13">Weekly public contributions over the past year</text>
  <text x="214" y="108" text-anchor="middle" fill="#58a6ff" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="32" font-weight="700">${calendar.totalContributions}</text>
  <text x="214" y="132" text-anchor="middle" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12">TOTAL CONTRIBUTIONS</text>
  <line x1="390" y1="92" x2="390" y2="138" stroke="#30363d"/>
  <text x="510" y="108" text-anchor="middle" fill="#58a6ff" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="32" font-weight="700">${currentStreak}</text>
  <text x="510" y="132" text-anchor="middle" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12">CURRENT STREAK</text>
  <line x1="630" y1="92" x2="630" y2="138" stroke="#30363d"/>
  <text x="750" y="108" text-anchor="middle" fill="#58a6ff" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="32" font-weight="700">${longestStreak}</text>
  <text x="750" y="132" text-anchor="middle" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12">LONGEST STREAK</text>
  <text x="870" y="177" text-anchor="end" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">refreshed ${updatedAt}</text>
  ${monthLabels.join("\n  ")}
  ${chartGrid.join("\n  ")}
  <polygon points="${areaPoints}" fill="#238636" fill-opacity="0.20"/>
  <polyline points="${linePoints}" fill="none" stroke="#39d353" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  ${chartMarkers.join("\n  ")}
  <line x1="88" y1="346" x2="868" y2="346" stroke="#30363d"/>
  <text x="88" y="378" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">${publicRepositories.totalCount} public repositories</text>
  <text x="868" y="378" text-anchor="end" fill="#8b949e" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">Each point represents one week</text>
</svg>
`;

await writeFile("assets/github-stats.svg", svg, "utf8");