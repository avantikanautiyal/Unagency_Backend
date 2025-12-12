// import { streamServerClient } from "../config/getStreamIo.config";
// import firebaseAdmin from "../libs/firebase";
import Users from "../models/users.model";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

const helloWrld = asyncHandler(async (req, res) => {


    // const roomInfo = await createRoomForProject({
    //     roomName: "manual test",
    //     roomId: uuid6(),
    //     project_id: "test",
    //     membersId: ['6913192a6b6791de92dbdd80',
    //         '691320aea5199a7b5b5e6492',
    //         '691ae9a43bcc8f27b5353ec8'],
    //     relationShipManagerId: "6913192a6b6791de92dbdd80",
    // });
    // await deleteAllStreamChannels();
    // await deleteAllStreamUsers();
    // await deleteAllAuthUsersExcept("superadmin@unagency.app", { dryRun: false });

    // await Users.deleteMany({ email: { $ne: "superadmin@prakria.com" } });


    return new ApiResponse(200, { message: "Hello World" }, "Hello World");

});
// export async function deleteAllStreamChannels() {


//     const sort: any = [{ field: "created_at", direction: -1 }];

//     for (let offset = 0; ; offset += 1000) {
//         const channels = await streamServerClient.queryChannels({}, [], { limit: 1000, offset });
//         if (!channels.length) break;

//         for (const c of channels) {
//             if (c.id) await streamServerClient.channel(c.type, c.id).delete();
//         }
//     }
// }
// export async function deleteAllStreamUsers() {


//     //   const sort: UserSort = [{ field: "created_at", direction: -1 }];

//     for (let offset = 0; ; offset += 100) {
//         const res = await streamServerClient.queryUsers({}, [], { limit: 100, offset });
//         const users = res.users ?? [];

//         console.log("users", users);
//         if (!users.length) break;

//         for (const u of users) {
//             if (u.id) await streamServerClient.deleteUser(u.id);
//         }
//     }
// }
// export async function deleteAllAuthUsersExcept(
//     exceptEmail = "superadmin@unagency.app",
//     opts?: { dryRun?: boolean }
// ) {
//     const dryRun = opts?.dryRun ?? false;
//     const except = exceptEmail.trim().toLowerCase();

//     const uidsToDelete: string[] = [];
//     let pageToken: string | undefined = undefined;
//     let kept: { uid: string; email?: string | null }[] = [];

//     // 1) Collect UIDs to delete
//     do {
//         const res = await firebaseAdmin.auth().listUsers(1000, pageToken);
//         pageToken = res.pageToken;

//         for (const u of res.users) {
//             const email = (u.email ?? "").trim().toLowerCase();
//             if (email && email === except) {
//                 kept.push({ uid: u.uid, email: u.email });
//                 continue;
//             }
//             uidsToDelete.push(u.uid);
//         }
//     } while (pageToken);

//     console.log(`Kept (matched except email):`, kept);
//     console.log(`Users to delete: ${uidsToDelete.length}`);

//     if (dryRun) {
//         console.log(`[dryRun] Would delete ${uidsToDelete.length} users.`);
//         return { deleted: 0, kept, toDelete: uidsToDelete.length };
//     }

//     // 2) Delete in batches of 1000
//     let deletedCount = 0;
//     for (let i = 0; i < uidsToDelete.length; i += 1000) {
//         const batch = uidsToDelete.slice(i, i + 1000);
//         const result = await firebaseAdmin.auth().deleteUsers(batch);

//         deletedCount += result.successCount;

//         // If any failures, log them (e.g., already deleted)
//         if (result.failureCount > 0) {
//             console.warn(
//                 `Batch had ${result.failureCount} failures:`,
//                 result.errors.map(e => ({ index: e.index, error: String(e.error) }))
//             );
//         }

//         console.log(
//             `Deleted so far: ${deletedCount}/${uidsToDelete.length} (this batch success: ${result.successCount})`
//         );
//     }

//     console.log(`Done. Deleted ${deletedCount} users. Kept:`, kept);
//     return { deleted: deletedCount, kept, toDelete: uidsToDelete.length };
// }


export { helloWrld };
