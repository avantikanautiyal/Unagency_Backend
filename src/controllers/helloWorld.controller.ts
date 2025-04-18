import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { projectNotification } from "../background/queue/projectNotification.queue";
import { EmailQueue } from "../background/queue/email.queue";
import { Notification } from "../background/utils/notification";
const helloWrld = asyncHandler(async (req, res) => {

  //  you can Directly return a response like this  and its work as expected 
  // return new ApiResponse(200, "Hello world", "success");
  // or you can use a more traditional way 
  console.log("hit")
//  const n =  await EmailQueue.add("asdasd", {
//     action: "SUBSCRIPTION",
//     data: {
//       email: "sourav.sharma@prakria.com",
//       customerName: "sourav sharma",
//       planName: "Gold clup",
//       startDate: "15-Aprl-2025",
//       nextRenualDate: "30-Aprl-2025",
//       BillingCycle: "monthly",
//       price: `INR 9999`
//     },
//     notification: new Notification("Bronze gold club", "", "COMMON") as any,
//   });
  // console.log("back job ",EmailQueue)
  res
    .status(200)
    .json(new ApiResponse(200, "Hello world", "success"));
});

export { helloWrld };
