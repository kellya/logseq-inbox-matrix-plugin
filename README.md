> [!WARNING]
> I have not directly written any of this code.  I took what "shady2k" wrote for
> telegram, and had Anthropic's Claude AI convert it to use matrix.  I don't know
> TypeScript, so my capabilities to edit this are pretty minimal.  I have tested
> this locally with my own matrix server, and it works, but defintely use at your
> own risk.

## Inbox Matrix Plugin
This is simple plugin that get new messages from a Matrix room and post it to
your daily journal. 

## Configuration
- Create a room on your matrix server **Do not enable encryption**
- Copy the room id (it'll be something like !randomchars:yourserver.com) and set
    that in the `matrixRoomId` property
- Get an auth token for the user you wish to use
- You may adjust polling interval `pollingInterval` in minutes, by default it is
    1 minute.
- Messages will be pasted in daily journal into block with text, specified in `inboxName` property. Replace it in case of necessary. If you don't want to group messages, set `inboxName` property to `null`. In this case messages will be inserted directly into page block.
- If `addTimestamp` is set to true, message received time in format `HH:mm` will be added to message text, for example `21:13 - Test message`
- If `useActiveGraph` is set to true, all messages will be processed in the currently active graph. If `useActiveGraph` is set to false, messages will be processed only if the `botTargetGraph` graph name is equal to the currently active graph. If the `botTargetGraph` is not equal to the current graph, the plugin will skip processing and your messages will be processed when you switch back to the required graph.
- **Restart plugin in Logseq**
- Then write any message in this chat, it will be added to your Logseq daily journal within 60 seconds (by default)

Settings with grouping:
```json
{
  "matrixHomeserver": "https://your-matrix-server.com",
  "matrixUserId": "@user:your-matrix-server.com",
  "matrixAccessToken": "your token",
  "matrixRoomId": "!randomchars:your-matrix-server.com",
  "pollingInterval": "1",
  "inboxName": "#inbox",
  "authorizedUsers": [],
  "useActiveGraph": true,
  "matrixTargetGraph": "",
  "addTimestamp": false,
  "invertMessagesOrder": true,
  "disabled": false
}
```

Set `inboxName` with `null` if you don't want use groups:
```json
{
  "inboxName": null
}
```

## Usage notice
- Please, consider that messages will be pulled from matrix only if Logseq desktop application running.
- If you doesn't open Logseq application more than 24 hours, messages from matrix will be lost and you need to resend it.

### Contribute
- `yarn && yarn build` in terminal to install dependencies.
- `Load unpacked plugin` in Logseq Desktop client.

### License
MIT
