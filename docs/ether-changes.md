# What Ether changes in Orca

Ether is a personal fork of [Orca](https://github.com/stablyai/orca). This is the short list of
everything it does differently, in terms of what you see. Each entry has a stable ID; the
[technical reference](ether-changes-technical.md) explains how each one is built, what must stay
true through an upstream merge, and how to check it.

Keep this list current: a fork change that alters what the user sees adds or edits an entry here
in the same commit.

## Features

**E1. Ether is its own Mac app.** Ether runs beside Orca with its own name, profile and keychain
entry. It never installs an Orca update and never reads or changes Orca's data.

**E2. Local signed builds, one folder per release.** `pnpm build:ether` builds a signed Apple
Silicon app into a new dated folder. A build never replaces the running app, and older releases
stay available for rollback.

**E3. Projects with several folders, and Workspaces over them.** A Project groups existing
directories; one directory can be in several Projects. Each Workspace is a separately saved view
of its Project (tabs, drafts, layout, terminals, agent chats), optionally with a different checkout
per folder. Creating a Workspace never creates a branch or worktree. Workspaces are archived, not
deleted. This replaces Orca's repo and worktree sidebar flow.

**E4. Agents see every folder in the Workspace.** Claude and Codex, as terminals or built-in chats,
start with access to all of the Workspace's folders. A chat keeps the folders it started with,
even after a restart. Where an agent can't be given every folder, Ether refuses with a message
rather than starting it with less.

**E5. Files, search and editor work across folders.** The file explorer, quick open and search
show every folder, labelled by name. Each Workspace keeps its own unsaved edits to a shared file;
saving updates the file for every Workspace and blocks a conflicting save.

**E6. Source Control per folder.** Each folder in a Workspace has its own Git status, diffs,
staging and commits, and every Git action names the folder it applies to.

**E7. Linear issues linked to Workspaces.** A Workspace can link several Linear issues, and an
issue can link to several Workspaces. Links show in the sidebar, Tasks, issue details and jump
search, and you can start a new Workspace from an issue. Linear works without the optional agent
skill, and slow Linear reads time out with a retry instead of hanging.

**E8. A quieter sidebar.** Marks 1–9 pin Workspaces to number shortcuts. Workspaces sort by recent
use inside a fixed Project order. Holding Ctrl+` cycles recent Workspaces. Archiving the open
Workspace moves you to the previous one and offers Undo. The footer shows the open Workspace's
folders, branches and changes.

**E9. Fork Chat.** Right-click a built-in Claude or Codex chat and choose Fork Chat to copy its
conversation into a new chat beside it. The original is unchanged, and the copy keeps every
Workspace folder.

**E10. Old chat history carried forward (temporary).** Chats saved before the first upstream merge
are imported once into the new chat database. To be removed once every Ether profile has run it.

## Left out or removed

- **OpenCode built-in chat** was removed in favour of Orca's own OpenCode support. OpenCode is not
  yet offered in Workspaces with more than one folder.
- **SSH and remote hosts** are untested; Ether doesn't build the remote server. Use Orca for remote
  work.
- **Paired web and mobile clients** don't get Ether's Projects UI; local Workspaces show up there
  at most as plain folder workspaces.

## Fork maintenance

**M1. Fork-surface check and drift report.** `pnpm check:ether-fork-surface` fails if the fork
touches an upstream file that isn't recorded. `pnpm ether:upstream-drift` reports how far behind
upstream Ether is and which fork areas would conflict. See
[ether-maintenance.md](ether-maintenance.md).
