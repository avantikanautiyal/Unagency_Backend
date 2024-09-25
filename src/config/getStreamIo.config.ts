import { StreamChat } from 'stream-chat';
// instantiate your stream client using the API key and secret
// the secret is only used server side and gives you full access to the API
// const getstream_io_key = "REDACTED";
// const getstream_io_secret = "REDACTED";
// export const streamServerClient = StreamChat.getInstance(
//     getstream_io_key,
//     getstream_io_secret);
export const streamServerClient = StreamChat.getInstance(
    process.env.getstream_io_key!,
    process.env.getstream_io_secret!);
// console.log(
//     process.env.getstream_io_key!,
//     process.env.getstream_io_secret!
// )
