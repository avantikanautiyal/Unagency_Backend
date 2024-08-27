import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";

const helloWrld = asyncHandler(async (req, res) => {

  //  you can Directly return a response like this  and its work as expected 
  // return new ApiResponse(200, "Hello world", "success");
  // or you can use a more traditional way 
  res
    .status(200)
    .json(new ApiResponse(200, "Hello world", "success"));
});

export { helloWrld };
