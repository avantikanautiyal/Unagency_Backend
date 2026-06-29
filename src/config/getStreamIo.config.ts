import { StreamChat } from "stream-chat";

export const streamServerClient = StreamChat.getInstance(
  process.env.getstream_io_key!,
  process.env.getstream_io_secret!
);
