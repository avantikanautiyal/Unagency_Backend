import { createRoomForProject } from "../services/Chatstream";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { v6 as uuid6 } from "uuid";

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



    return new ApiResponse(200, { message: "Hello World" }, "Hello World");

});

export { helloWrld };
