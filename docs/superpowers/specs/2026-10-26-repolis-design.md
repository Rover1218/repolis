# Repolis — design

*2026-10-26 · status: draft for approval*

Repolis turns any public GitHub repo into a holographic 3D city that you can watch grow from the first commit to today, then fly around and walk through. Every city has its own link, made to be shared.

Each top-level folder is a district, each file is a building, and a building's height is the file's size. A time-lapse replays the repo's history: buildings rise as files grow, glow when they change, and sink into the floor when they are deleted.

Visual reference: [assets/2026-10-26-repolis-look-prototype.html](assets/2026-10-26-repolis-look-prototype.html). Open it in a browser; it uses fake data, and the look and controls are what matter. It opens in look **B · Solid light**, which is the chosen look. Looks A and C are rejected alternatives and are kept only for comparison.

Decisions are marked **(owner)** when the project owner made them and **(my call)** when Claude made them during design. The owner can still overturn any *my call*.

---

## 1. Intent

- **What it's for.** It's a fun, shareable way to *see* a codebase and its history. The moment that matters is when someone pastes a repo link and watches their project's skyline build itself.
- **Why people come back and spread it.** Each city has a link that opens straight into the replay, and the link unfurls on social apps with a picture of the skyline. *(owner: sharing is the goal after watching)*
- **Success (my call; the owner had no strong view).** People paste their own repos and post the links. Famous repos on the front page give a first-time visitor the "wow" moment without needing a repo of their own.

## 2. Goals

1. Paste any public GitHub repo link on a web page and get its city. *(owner: web page, any repo)*
2. The city is a hologram you can move around from outside, or fly into and walk inside. *(owner)*
3. The history is replayed as a time-lapse of up to ~200 snapshots, not every commit. *(owner: approved the snapshot tradeoff)*
4. The look is B · Solid light from the prototype, with real lighting and shadows. Glow is limited to edges and recently changed files, and the scene never looks blown out. *(owner: v1 was "too bright"; v2 with B was "better")*
5. The city makes sense even when the history is weird, such as one giant commit or very few commits (§6). *(owner asked; owner approved the behaviour)*
6. Sharing works: a link per city, link previews, Copy link, Save image, and famous example repos (§8). *(owner)*
7. It's hosted on Vercel with no database. *(owner: Vercel; owner: approved no database because of storage limits)*

## 3. Non-goals for v1

- Private repos or GitHub sign-in *(my call)*.
- GitLab, Bitbucket or any host other than GitHub *(my call)*.
- Stepping through every single commit *(owner: snapshots are fine)*.
- Recording the time-lapse as a video, and a README badge. Both are good later ideas *(my call)*.
- Comparing two repos, editing anything, or any accounts.
- A style switcher. Ship look B only *(my call; A and C were for the brainstorm)*.

## 4. Anti-goals: failures even if it "works"

- **A blown-out glow where buildings can't be read.** This is what the owner explicitly rejected in v1.
- **A blank screen while history loads.** The city must start appearing as soon as the first data arrives.
- **Invented history.** The replay may sample commits, but it must never show a change that didn't happen.
- **Breaking, or looking broken,** on one-commit, empty or huge repos.
- **Needing a sign-in just to look.**
- **Buildings jumping around between snapshots.** Positions must stay fixed for the whole replay.

## 5. Constraints

- **Hosting:** Vercel, on the owner's existing **free Hobby plan** *(owner)*. Function duration, response-body size (currently around 4.5 MB), ISR/cache quotas and bandwidth limits apply. Check current numbers at build time.
- **Code lives in a private GitHub repo** under the owner's account (Rover1218) *(my call: safe default; the owner can make it public later)*. Neither the `gh` CLI nor the Vercel CLI is installed yet. The owner will create the GitHub API token themselves and put it in `.env.local` and in Vercel's settings; it never goes into chat or into git.
- **No database or blob storage** *(owner)*. Caching is Vercel's CDN cache plus the visitor's own browser storage (§7).
- **GitHub API** goes through one server-side token in a Vercel environment variable, which gives about 5,000 REST requests an hour. The token must never reach the browser.
- **Code standards** (owner's global rules): TypeScript, test-first (TDD), at least 80% test coverage, plus unit, integration and E2E tests. E2E testing needs a Playwright browser installed; this machine currently has none.
- **Name:** Repolis *(my call; the owner asked Claude to pick)*. Vercel subdomain availability is unchecked.

## 6. How the city is built from history

### Snapshots *(owner approved the approach; details are my calls)*

- Use the default branch and count its commits.
- Pick **N = min(200, commit count)** snapshot commits, spread evenly **by commit index** rather than by calendar time. The first and the latest commit are always included. Busy periods therefore get more of the replay than quiet years.
- For each snapshot, record the commit SHA, date, author and message headline, plus the full file list with each file's size in bytes and its blob SHA.
- A file "changed" between two snapshots if its blob SHA differs. That is what drives the warm glow.
- Repos with ≤ 200 commits get one snapshot per commit, so the replay is exact.

### Unusual histories

| Case | What the viewer sees |
|---|---|
| **1 commit** (whole project pushed at once) | A **construction sequence**. Districts rise one after another, biggest first, with their buildings going up in a wave over about 5 s. The timeline is replaced by the line "Pushed all at once · 1 commit · *date*". |
| **A few commits** (2–5) | One snapshot per commit. Any snapshot that adds a large part of the city plays as a construction wave instead of popping in. |
| **Giant first commit, then normal work** | The first snapshot plays as a construction wave, and the city then grows normally. An **activity strip** above the slider shows how much changed per snapshot, so the dump appears as a tall spike. |
| **Empty repo** (no commits) | A friendly message, with no city. |

"Large part of the city" means the snapshot adds more than ~30% of the final city's total size. The exact threshold is the builder's call.

### Huge repos *(my call)*

- Huge repos are in v1 scope, because the owner wants "any repo". They are **built last**, though, and the front-page examples don't depend on them.
- When a snapshot would have more than ~20k buildings, tiny files in the same folder merge into one block, labelled for example "+312 small files".
- Repos too big to fetch full file lists for within the GitHub budget (Linux-sized, where GitHub truncates the listing) get a **coarse mode**:
  - far fewer snapshots (~30);
  - file lists fetched per top-level folder;
  - aggressive merging of small files.
- If the GitHub budget can't cover a coarse build at that moment, show the "GitHub is busy" message. Never show a city with files silently missing.

### File sizes, not lines *(my call)*

- GitHub's file listings give byte sizes, not line counts, so building height comes from bytes. On a square-root scale, small and big files stay comparable, as in the prototype.
- The tooltip shows the size plus an estimated line count marked "≈".

### Layout *(my call; the algorithm is the builder's call)*

- **Districts are the meaningful folder level, not always the top level.** This matches the prototype the owner approved, which has districts like `src/components` and `packages/core`.
  - Start from the top-level folders.
  - Any folder holding more than ~35% of the repo's files is split into its subfolders, repeating as needed. For example, vscode's `src/` becomes `src/vs/editor`, `src/vs/workbench` and so on, instead of one giant block.
  - Labels show the district's full path. Deeper folders become sub-blocks inside their district.
  - Files in the repo root go into a "/" district.
  - The split uses the all-time file table, so districts stay the same for the whole replay.
- Positions are computed from **every file that ever existed** across the replay, so nothing moves while the timeline plays. A deleted file leaves an empty lot.
- The layout must be deterministic: the same repo always produces the same city.

### Data flow *(my call; the exact API shape is the builder's call)*

A repo nobody has opened before can't be replayed right away. Fetching ~200 full file lists from GitHub takes from a few seconds (small repos) to tens of seconds (big ones), and the replay layout needs all of them. So a first visit happens in two stages:

1. **Today's city, fast.** One or two GitHub requests fetch the latest file list. Within about 2 s the current skyline goes up as a construction wave, so the screen is never blank, and the visitor can already fly around.
2. **History in the background.** The browser fetches the history in **batches** of snapshots. Each batch is a separate short server call that holds only the changes since the previous snapshot. A progress line shows on the timeline ("Fetching history… 63%").
3. **Replay.** When the history is complete, the replay starts automatically from the first commit.
   - The replay layout is computed from every file that ever existed.
   - Switching from today's-city layout to the replay layout happens while the city collapses to the empty first snapshot, so **nothing moves during the replay itself**.
   - Cached repos skip stage 1 and replay immediately.

Each server call stays well under Vercel's body-size and time limits. Store only what changed between snapshots. A typical repo should come to tens of KB and a huge one to a few MB.

**GitHub request budget.** A new repo costs about 1 file-list request per snapshot, plus a handful more to locate the snapshot commits. GraphQL can batch the commit lookups. At 5,000 requests an hour that allows only about 20 *uncached* repos an hour, which is the main scaling risk (§11).

## 7. Caching without a database *(owner approved)*

The owner's concern was storage that fills up and needs managing. So there is **no database, KV or Blob store that we write to and would have to clean up**. Caching that Vercel manages and evicts by itself is fine:

- **Durable server cache** *(my call)*. Use Vercel's managed, self-evicting server-side cache for built cities, such as Next.js ISR / Data Cache. Unlike the CDN cache, this persists across regions and redeploys, so a repo is built from GitHub once per refresh window and not once per region.
  - Check current Hobby-plan quotas and per-item size limits. Batch sizes may need to fit them.
- **CDN cache** in front of that, with long cache lifetimes and stale-while-revalidate, so a city refreshes in the background when new commits land.
- **The visitor's browser** keeps fetched cities (for example IndexedDB), so a repeat visit on the same device skips the network.
- Popular repos stay instant. A repo that dropped out of every cache costs the next visitor the two-stage first visit (§6) and some GitHub budget.
- Keep data access behind one module, so adding real storage later is a small change.

## 8. The page

### Front page *(owner approved)*

- The Repolis name, a paste box, and **3–4 famous mid-size repos** as one-click examples, such as `facebook/react` and `vercel/next.js`. The examples must not depend on the huge-repo coarse mode, so no `torvalds/linux` at launch. They should open instantly, so warm their cache after each deploy (builder's call on how).
- The paste box accepts `https://github.com/owner/repo`, `github.com/owner/repo`, `owner/repo`, and links with extra parts such as `/tree/main` or `.git`.

### City page: `/owner/repo` *(owner)*

- The URL mirrors GitHub's, so `github.com/x/y` becomes `<site>/x/y`. Opening it plays the replay straight away.
- **Arrival:** the camera flies in from a distance, and the replay autoplays for about 12 s across all snapshots *(my call)*. On a first-ever visit to a repo, today's city appears first and the replay starts when the history finishes loading (§6).
- **HUD**, following the prototype:
  - repo name, file count and district count;
  - a timeline with play/pause, a slider over snapshots, and a readout of date, commit number and files alive at that point;
  - the activity strip;
  - a "Dive in" / "Step out" button;
  - **Copy link** and **Save image** buttons.
- **Hover tooltip:** file path, size and ≈ lines, how many snapshots it changed in so far, and when it last changed.
  - "Last touched by *author*" from the prototype is shown **only when snapshots are exact commits** (≤ 200 commits). With sampling, the author of a change between two snapshots is unknown, and guessing would be invented history *(my call)*.
- **Labels:** top-level district names float over each district. Sub-folder names appear when the camera is close *(my call)*.
- **Errors, in plain words:**
  - "Not a GitHub repo link"
  - "Repo not found or private"
  - "This repo is empty"
  - "GitHub is busy — try again in N minutes", using the rate-limit reset time
  - "Your browser can't show 3D"
- **Link preview (Open Graph) image** per repo: a 2D skyline silhouette in the Repolis colours, built from the **latest** file list only. This keeps social-app crawlers from triggering a full history fetch *(my call)*.
- **Save image:** a PNG of the current 3D view, made in the browser.
- **Copy link:** copies the city URL.

## 9. Look and movement

Match look **B · Solid light** in the reference prototype.

- **Buildings:**
  - Solid glossy material (low roughness, some metalness) with a deep violet body.
  - Lit by a shadow-casting key light, a sky/ground fill and a coloured rim light from behind.
  - Subtle environment reflections.
- **Glow:**
  - Thin edge glow and a soft fresnel rim.
  - A gentle scan sweep moving up the city, plus rare tiny flickers.
  - Bloom picks up only the bright parts. Tone mapping keeps highlights from clipping to white.
- **Colours:** blue-violet to pink by height. Recently changed files glow warm yellow, and the glow fades over a few snapshots.
- **Stage:**
  - The city floats on a dark glass disc that shows the shadows.
  - The disc carries a faint grid and a glowing rim.
  - Under it are a dim projector beam, rising motes, and faint dust in the distance.
- **Desktop controls** (prototype):
  - drag to orbit and scroll to zoom;
  - "Dive in" flies to street level and "Step out" or Esc flies back;
  - double-click a building to fly to it;
  - WASD to walk and Q/E to move down/up.
- **Phone controls** *(my call)*:
  - drag to orbit and pinch to zoom;
  - double-tap a building to fly to it;
  - the Dive in / Step out button;
  - no walking.
  - Lower render quality as needed: pixel ratio, shadow-map size, bloom.
- **Reduced motion:** no fly-in and no autoplay. Show the final city with the timeline paused at the end.
- **Performance targets** *(my call)*: smooth (about 60 fps) on a mid-range laptop with ~5k buildings, and usable (≥ 30 fps) on a mid-range phone.

## 10. Stack *(my call; the owner deferred)*

- **Next.js (App Router) + TypeScript on Vercel.** Each city URL needs server-rendered metadata and an OG image, and the GitHub calls must run server-side with the token.
- **three.js for the 3D.** Using React Three Fiber or plain three.js inside a client component is the builder's call. The prototype is plain three.js with a patched `MeshStandardMaterial`, and porting that shader logic is expected.

## 11. Risks

- **GitHub budget** (~20 uncached repos an hour on one token). Mitigations: CDN caching, pre-warmed examples, the "GitHub is busy" error, and a per-visitor limit on *uncached* builds that works without a database (method is the builder's call). The path past this is a GitHub App or more tokens, later.
- **Huge repos** hitting time and size limits. Mitigations: fewer snapshots, merged small files and batched responses (§6).
- **Vercel's CDN cache is split by region** and may be cleared on redeploys. That's why the durable server cache in §7 exists. Re-warm the examples after each deploy anyway.

## 12. Left to the builder

- React Three Fiber vs plain three.js.
- The API route shape and the data format.
- The exact layout algorithm.
- The thresholds: construction-wave trigger, merge limit, and the huge-repo snapshot count.
- The browser storage choice.
- How to pre-warm the examples.
- How to limit uncached builds per visitor.
- The design of the activity strip and the OG image, within the visual language above.
- Test tooling.
