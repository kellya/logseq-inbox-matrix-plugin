import "@logseq/libs";
import { BlockEntity, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";
import axios from "axios";
import dayjs from "dayjs";

let isProcessing = false;
let isDebug = false;

interface IPayload {
  from?: string; // Timeline token for pagination
}

interface IMatrixEvent {
  event_id: string;
  room_id: string;
  sender: string;
  origin_server_ts: number;
  content: {
    msgtype: string;
    body: string;
  };
  type: string;
}

interface IMatrixSync {
  next_batch: string;
  rooms: {
    join: {
      [key: string]: {
        timeline: {
          events: IMatrixEvent[];
          prev_batch: string;
        }
      }
    }
  }
}

interface IMessagesList {
  roomId: string;
  text: string;
}

/**
 * main entry
 */
async function main() {
  const logseqSettings = logseq.settings;

  if (!logseqSettings) {
    logseq.UI.showMsg("[Inbox Matrix] Cannot get settings", "error");
    return;
  }

  if (logseqSettings.isDebug === true) {
    isDebug = true;
  }

  if (!logseqSettings.hasOwnProperty("inboxName")) {
    logseq.updateSettings({
      inboxName: "#inbox",
    });
  }

  if (!logseqSettings.hasOwnProperty("invertMessagesOrder")) {
    logseq.updateSettings({
      invertMessagesOrder: false,
    });
  }

  if (!logseqSettings.hasOwnProperty("addTimestamp")) {
    logseq.updateSettings({
      addTimestamp: false,
    });
  }

  if (!logseqSettings.hasOwnProperty("authorizedUsers")) {
    logseq.updateSettings({
      authorizedUsers: [],
    });
  }

  if (!logseqSettings.hasOwnProperty("preserveEmptyBlock")) {
    logseq.updateSettings({
      preserveEmptyBlock: true,
    });
  }

  if (
      typeof logseqSettings.pollingInterval === "undefined" ||
      logseqSettings.pollingInterval === null
  ) {
    logseq.updateSettings({
      pollingInterval: 10, // Default 10 minutes instead of 60000 milliseconds
    });
  }

  if (!logseqSettings.hasOwnProperty("matrixHomeserver")) {
    logseq.updateSettings({
      matrixHomeserver: "https://matrix.org",
    });
  }

  if (!logseqSettings.hasOwnProperty("matrixAccessToken")) {
    logseq.updateSettings({
      matrixAccessToken: "",
    });
  }

  if (!logseqSettings.hasOwnProperty("matrixUserId")) {
    logseq.updateSettings({
      matrixUserId: "",
    });
  }

  if (!logseqSettings.hasOwnProperty("matrixRoomId")) {
    logseq.updateSettings({
      matrixRoomId: "",
    });
  }

  applySettingsSchema();

  if (!logseqSettings.matrixAccessToken || !logseqSettings.matrixHomeserver || !logseqSettings.matrixUserId || !logseqSettings.matrixRoomId) {
    logseq.UI.showMsg("[Inbox Matrix] You should complete plugin settings", "error");
    return;
  }

  console.log("[Inbox Matrix] Started!");
  setTimeout(() => {
    process();
  }, 3000);

  if (logseqSettings.pollingInterval > 0) {
    startPolling();
  }
}

function applySettingsSchema() {
  const settings: SettingSchemaDesc[] = [
    {
      key: "matrixHomeserver",
      description: "Matrix homeserver URL (e.g., https://matrix.org)",
      type: "string",
      default: "https://matrix.org",
      title: "Matrix Homeserver",
    },
    {
      key: "matrixUserId",
      description: "Your Matrix User ID (e.g., @username:matrix.org)",
      type: "string",
      default: "",
      title: "Matrix User ID",
    },
    {
      key: "matrixAccessToken",
      description: "Your Matrix access token. You can get it from your Matrix client settings or by using the Matrix login API.",
      type: "string",
      default: "",
      title: "Matrix Access Token",
    },
    {
      key: "matrixRoomId",
      description: "The Matrix room ID to monitor for messages (e.g., !roomid:matrix.org)",
      type: "string",
      default: "",
      title: "Matrix Room ID",
    },
    {
      key: "pollingInterval",
      description:
          "How often to check for new messages from Matrix (in minutes)",
      type: "number",
      default: 10,
      title: "Polling interval (minutes)",
    },
    {
      key: "inboxName",
      description:
          "Messages will be pasted in daily journal into block with text, specified in inboxName property. Replace it in case of necessary. If you don't want to group messages, set inboxName property to null. In this case messages will be inserted directly into page block",
      type: "string",
      default: "#inbox",
      title: "Title in daily journal",
    },
    {
      key: "authorizedUsers",
      description:
          "List of Matrix user IDs that are allowed to send messages to this plugin. If empty, all messages from all users will be processed.",
      type: "object",
      default: [],
      title: "Authorized Users",
    },
    {
      key: "useActiveGraph",
      description: "If enabled, Matrix messages will be sent to the currently active graph",
      type: "boolean",
      default: true,
      title: "Paste messages to currently active graph",
    },
    {
      key: "matrixTargetGraph",
      description: "Specify the graph where Matrix messages should be received, used only if useActiveGraph is false",
      type: "string",
      default: "",
      title: "Matrix Target Graph",
    },
    {
      key: "addTimestamp",
      description:
          "If this set to true, message received time in format HH:mm will be added to message text, for example 21:13 - Test message",
      type: "boolean",
      default: false,
      title: "Add timestamp",
    },
    {
      key: "invertMessagesOrder",
      description:
          "New messages adds to the top of node by default, this setting will inverse the order of added messages, new messages will be added to the bottom of node",
      type: "boolean",
      default: false,
      title: "Invert messages order",
    },
    {
      key: "preserveEmptyBlock",
      description:
          "If enabled, new content will be added before the last block if it's empty. If disabled, the empty block will be removed before adding new content.",
      type: "boolean",
      default: true,
      title: "Preserve empty block",
    },
    {
      key: "isDebug",
      description:
          "Debug mode. Usually you don't need this. Use it if you are developer or developers asks you to turn this on",
      type: "boolean",
      default: false,
      title: "Debug mode",
    },
  ];
  logseq.useSettingsSchema(settings);
}

function startPolling() {
  console.log("[Inbox Matrix] Polling started!");
  // Convert minutes to milliseconds when setting up the interval
  const pollingIntervalMs = logseq.settings!.pollingInterval * 60 * 1000;
  setInterval(() => process(), pollingIntervalMs);
}

async function process() {
  log("Processing");

  if (!logseq.settings!.useActiveGraph) {
    const matrixTargetGraph = logseq.settings!.matrixTargetGraph;
    const currentGraph = await logseq.App.getCurrentGraph();
    if (currentGraph?.name !== matrixTargetGraph) {
      log(`Not in the Matrix target graph: ${matrixTargetGraph}, current graph: ${currentGraph?.name}, skipped`);
      return;
    }
  }

  if (isProcessing) {
    log("Already running, processing skipped");
    return;
  }

  isProcessing = true;

  const messages = await (async () => {
    try {
      const res = await getMessages();
      return res;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  })();

  log({ messages });
  if (!messages || messages.length === 0) {
    isProcessing = false;
    return;
  }

  const todayJournalPage = await getTodayJournal();
  if (
      !todayJournalPage ||
      todayJournalPage.length <= 0 ||
      !todayJournalPage[0].name
  ) {
    await logseq.UI.showMsg(
        "[Inbox Matrix] Cannot get today's journal page",
        "error"
    );
    isProcessing = false;
    return;
  }

  const inboxName = logseq.settings!.inboxName || null;
  const messageTexts = messages.map(item => item.text);

  await insertMessages(todayJournalPage[0].name, inboxName, messageTexts);

  await logseq.UI.showMsg("[Inbox Matrix] Messages added to inbox", "success");
  isProcessing = false;
}

async function insertMessages(
    todayJournalPageName: string,
    inboxName: string | null,
    messages: string[]
) {
  const inboxBlock = await checkInbox(todayJournalPageName, inboxName);
  if (!inboxBlock) {
    isProcessing = false;
    await logseq.UI.showMsg("[Inbox Matrix] Cannot get inbox block", "error");
    return;
  }

  const blocks = messages.map((message) => ({ content: message }));

  // If we're working with a named inbox (not null/empty)
  if (inboxName !== null && inboxName !== "null" && inboxName !== "") {
    if (logseq.settings!.invertMessagesOrder) {
      // For inverted order: Add each message individually to the bottom
      const inboxBlockTree = await logseq.Editor.getBlock(inboxBlock.uuid, { includeChildren: true });

      // Start with the inbox block itself if no children
      let lastBlockUuid = inboxBlock.uuid;
      let params = { sibling: false, before: false };

      // If there are children, find the actual last child
      if (inboxBlockTree && inboxBlockTree.children && inboxBlockTree.children.length > 0) {
        // Get the deepest last block by traversing the tree
        let currentBlock = inboxBlockTree;
        while (currentBlock.children && currentBlock.children.length > 0) {
          currentBlock = currentBlock.children[currentBlock.children.length - 1] as any;
        }

        // Check if the last block is empty
        if (currentBlock.content === "") {
          if (logseq.settings!.preserveEmptyBlock) {
            // If preserveEmptyBlock is true, insert before the empty block
            // We need to find the parent of the empty block to correctly insert before it

            // Get parent's children
            const findParentBlockWithEmptyChild = (block: any, emptyBlockUuid: string) => {
              if (!block.children || block.children.length === 0) {
                return null;
              }

              for (let i = 0; i < block.children.length; i++) {
                const child = block.children[i];
                if (child.uuid === emptyBlockUuid) {
                  return { parentBlock: block, indexInParent: i };
                }

                const result = findParentBlockWithEmptyChild(child, emptyBlockUuid);
                if (result) {
                  return result;
                }
              }

              return null;
            };

            const result = findParentBlockWithEmptyChild(inboxBlockTree, currentBlock.uuid);

            if (result) {
              const { parentBlock, indexInParent } = result;

              // If it's the first child, insert as a child of parent but before the empty block
              if (indexInParent === 0) {
                lastBlockUuid = parentBlock.uuid;
                params = { sibling: false, before: false };

                // Insert each message
                for (const block of blocks) {
                  const newBlock = await logseq.Editor.insertBlock(
                      lastBlockUuid,
                      block.content,
                      params
                  );

                  if (newBlock) {
                    lastBlockUuid = newBlock.uuid;
                    params.sibling = true;
                  }
                }

                // Move the empty block to the end
                await logseq.Editor.moveBlock(currentBlock.uuid, lastBlockUuid, { before: false, sibling: true });

                return;
              } else {
                // Insert after the previous sibling
                const previousSibling = parentBlock.children[indexInParent - 1];
                lastBlockUuid = previousSibling.uuid;
                params = { sibling: true, before: false };
              }
            }
          } else {
            // If preserveEmptyBlock is false, remove the empty block
            await logseq.Editor.removeBlock(currentBlock.uuid);

            // If this was the only child, revert to inserting as a child of the inbox block
            if (inboxBlockTree.children.length === 1) {
              lastBlockUuid = inboxBlock.uuid;
              params.sibling = false;
            } else {
              // Get the previous sibling or parent, depending on the structure
              const findLastNonEmptyBlock = (block: any) => {
                if (!block.children || block.children.length === 0) {
                  return block;
                }

                // Exclude the last child if it was the empty one we just removed
                const childrenToConsider = block.children.slice(0, -1);

                if (childrenToConsider.length === 0) {
                  return block;
                }

                return findLastNonEmptyBlock(childrenToConsider[childrenToConsider.length - 1]);
              };

              const lastNonEmptyBlock = findLastNonEmptyBlock(inboxBlockTree);
              lastBlockUuid = lastNonEmptyBlock.uuid;
              params.sibling = lastNonEmptyBlock.uuid !== inboxBlock.uuid;
            }
          }
        } else {
          // Last block is not empty, use it as insertion point
          lastBlockUuid = currentBlock.uuid;
          params.sibling = true;
        }
      }

      // Insert each message one by one
      for (const block of blocks) {
        const newBlock = await logseq.Editor.insertBlock(
            lastBlockUuid,
            block.content,
            params
        );
        // Update the lastBlockUuid to the newly inserted block
        // so the next insertion goes after this one
        if (newBlock) {
          lastBlockUuid = newBlock.uuid;
          params.sibling = true;
        }
      }

      // Skip the batch insertion since we've already inserted blocks individually
      return;
    } else {
      // For normal order (top insertion), use batch insertion
      await logseq.Editor.insertBatchBlock(
          inboxBlock.uuid,
          blocks,
          {
            sibling: false,
            before: true
          }
      );
    }
  } else {
    // When inboxName is null/empty (page level insertion)
    const pageBlocksTree = await logseq.Editor.getPageBlocksTree(todayJournalPageName);

    if (logseq.settings!.invertMessagesOrder) {
      // Find the last block on the page
      const lastPageBlock = pageBlocksTree[pageBlocksTree.length - 1];

      // Check if the last block is empty
      if (lastPageBlock.content === "") {
        if (logseq.settings!.preserveEmptyBlock) {
          // If preserveEmptyBlock is true, insert before the empty block
          if (pageBlocksTree.length > 1) {
            // If there are other blocks, insert after the second-to-last block
            const secondToLastBlock = pageBlocksTree[pageBlocksTree.length - 2];

            // Insert each message one by one
            let lastInsertedBlockUuid = secondToLastBlock.uuid;
            for (const block of blocks) {
              const newBlock = await logseq.Editor.insertBlock(
                  lastInsertedBlockUuid,
                  block.content,
                  { sibling: true, before: false }
              );
              if (newBlock) {
                lastInsertedBlockUuid = newBlock.uuid;
              }
            }
          } else {
            // If it's the only block, insert at page level before the empty block
            for (let i = messages.length - 1; i >= 0; i--) {
              await logseq.Editor.insertBlock(
                  todayJournalPageName,
                  messages[i],
                  { sibling: true, before: true }
              );
            }
          }
          return;
        } else {
          // If preserveEmptyBlock is false, remove the empty block
          await logseq.Editor.removeBlock(lastPageBlock.uuid);

          // If this was the only block on the page, insert at page level
          if (pageBlocksTree.length === 1) {
            for (const message of messages) {
              await logseq.Editor.insertBlock(
                  todayJournalPageName,
                  message,
                  { sibling: false }
              );
            }
            return;
          } else {
            // Insert after the new last block
            const newLastBlock = pageBlocksTree[pageBlocksTree.length - 2];

            // Insert each message one by one
            let lastInsertedBlockUuid = newLastBlock.uuid;
            for (const block of blocks) {
              const newBlock = await logseq.Editor.insertBlock(
                  lastInsertedBlockUuid,
                  block.content,
                  { sibling: true, before: false }
              );
              if (newBlock) {
                lastInsertedBlockUuid = newBlock.uuid;
              }
            }
            return;
          }
        }
      }

      // Last block is not empty, use it as insertion point
      let lastBlockUuid = lastPageBlock.uuid;
      let params = { sibling: true, before: false };

      // Insert each message one by one at the bottom
      for (const block of blocks) {
        const newBlock = await logseq.Editor.insertBlock(
            lastBlockUuid,
            block.content,
            params
        );
        if (newBlock) {
          lastBlockUuid = newBlock.uuid;
        }
      }

      return;
    } else {
      // For normal order (top insertion), use batch insertion
      await logseq.Editor.insertBatchBlock(
          pageBlocksTree[0].uuid,
          blocks,
          {
            sibling: true,
            before: true
          }
      );
    }
  }
}

async function checkInbox(pageName: string, inboxName: string | null) {
  log({ pageName, inboxName });
  const pageBlocksTree = await logseq.Editor.getPageBlocksTree(pageName);

  if (inboxName === null || inboxName === "null" || inboxName === "") {
    log("No group");
    return pageBlocksTree[0];
  }

  let inboxBlock;
  inboxBlock = pageBlocksTree.find((block: { content: string }) => {
    return block.content === inboxName;
  });

  if (!inboxBlock) {
    const newInboxBlock = await logseq.Editor.insertBlock(
        pageBlocksTree[pageBlocksTree.length - 1].uuid,
        inboxName,
        {
          before: pageBlocksTree[pageBlocksTree.length - 1].content ? false : true,
          sibling: true
        }
    );
    return newInboxBlock;
  } else {
    return inboxBlock;
  }
}

async function getTodayJournal() {
  const d = new Date();
  const todayDateObj = {
    day: `${d.getDate()}`.padStart(2, "0"),
    month: `${d.getMonth() + 1}`.padStart(2, "0"),
    year: d.getFullYear(),
  };
  const todayDate = `${todayDateObj.year}${todayDateObj.month}${todayDateObj.day}`;

  let ret;
  try {
    ret = await logseq.DB.datascriptQuery(`
      [:find (pull ?p [*])
       :where
       [?b :block/page ?p]
       [?p :block/journal? true]
       [?p :block/journal-day ?d]
       [(= ?d ${todayDate})]]
    `);
  } catch (e) {
    console.error(e);
  }

  return (ret || []).flat();
}

function getMessages(): Promise<IMessagesList[] | undefined> {
  return new Promise((resolve, reject) => {
    let messages: IMessagesList[] = [];
    const matrixHomeserver = logseq.settings!.matrixHomeserver;
    const matrixAccessToken = logseq.settings!.matrixAccessToken;
    const matrixUserId = logseq.settings!.matrixUserId;
    const matrixRoomId = logseq.settings!.matrixRoomId;

    // Build sync filter to only get text messages from the specific room
    const filter = {
      room: {
        rooms: [matrixRoomId],
        timeline: {
          limit: 50,
          types: ["m.room.message"]
        }
      }
    };

    const payload: IPayload = {
      ...(logseq.settings!.syncToken && {
        from: logseq.settings!.syncToken,
      }),
    };

    // Prepare sync URL with filter
    const syncUrl = `${matrixHomeserver}/_matrix/client/r0/sync?timeout=30000&filter=${encodeURIComponent(JSON.stringify(filter))}`;
    const headers = {
      Authorization: `Bearer ${matrixAccessToken}`
    };

    if (payload.from) {
      const urlWithToken = `${syncUrl}&since=${encodeURIComponent(payload.from)}`;
      axios.get(urlWithToken, { headers })
          .then(processResponse)
          .catch(handleError);
    } else {
      axios.get(syncUrl, { headers })
          .then(processResponse)
          .catch(handleError);
    }

    function processResponse(response: any) {
      if (response && response.data) {
        const data: IMatrixSync = response.data;
        const nextBatch = data.next_batch;

        // Store the next_batch token for future syncs
        logseq.updateSettings({
          syncToken: nextBatch,
        });

        // Process the specific room
        if (data.rooms && data.rooms.join && data.rooms.join[matrixRoomId]) {
          const room = data.rooms.join[matrixRoomId];

          if (room.timeline && room.timeline.events) {
            room.timeline.events.forEach(event => {
              // Only process text messages
              if (
                  event.type === 'm.room.message' &&
                  event.content &&
                  event.content.msgtype === 'm.text' &&
                  event.content.body
              ) {
                const sender = event.sender;

                // Check if sender is authorized
                const authorizedUsers: string[] = logseq.settings!.authorizedUsers;
                if (authorizedUsers && authorizedUsers.length > 0) {
                  if (!authorizedUsers.includes(sender)) {
                    log({
                      name: "Ignore message, user not authorized",
                      sender,
                      roomId: matrixRoomId
                    });
                    return;
                  }
                }

                const text = ((messageText: string, addTimestamp: boolean) => {
                  if (addTimestamp) {
                    return `${dayjs(event.origin_server_ts).format("HH:mm")} - ${messageText}`;
                  } else {
                    return messageText;
                  }
                })(event.content.body, logseq.settings!.addTimestamp);

                log({
                  name: "Processing message",
                  roomId: matrixRoomId,
                  text,
                  sender
                });

                messages.push({
                  roomId: matrixRoomId,
                  text
                });
              }
            });
          }
        }

        resolve(messages);
      } else {
        logseq.UI.showMsg(
            "[Inbox Matrix] Unable to parse Matrix response",
            "error"
        );
        reject();
      }
    }

    function handleError(error: any) {
      console.error("Matrix sync error:", error);
      logseq.UI.showMsg(
          `[Inbox Matrix] Error syncing with Matrix: ${error.message || "Unknown error"}`,
          "error"
      );
      reject(error);
    }
  });
}

function log(message: any) {
  if (isDebug) console.log(message);
}

// bootstrap
logseq.ready(main).catch(console.error);