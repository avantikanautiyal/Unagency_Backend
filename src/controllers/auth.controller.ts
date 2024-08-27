import { JwtPayload, verify } from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";

const Verify = asyncHandler(async (req, res) => {
  const authHeader = req.headers["authorization"];
  const accessToken = authHeader && authHeader.split(" ")[1];
  if (accessToken) {
    try {
      const verification = verify(
        accessToken,
        process.env.SERVERTOKEN!
      ) as JwtPayload;
      if (verification) {
        return res
          .status(200)
          .json(new ApiResponse(200, verification?.user, "Verified"));
      }
    } catch (err) {
      throw new ApiError((err as Error).message, 401);
    }
  } else {
    throw new ApiError("No Token Provided", 401);
  }
});

export { Verify };
