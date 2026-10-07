import { accountService } from "../services/account-service";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const getMyProfile = asyncHandler(async (req: RequestUser) => {
  const data = await accountService.getProfile(String(req.user!.userId));
  return new ApiResponse(200, data, "Profile fetched");
});

export const updateMyProfile = asyncHandler(async (req: RequestUser) => {
  const body = req.body ?? {};
  const data = await accountService.updateProfile(String(req.user!.userId), {
    name: body.name,
    phone: body.phone,
    bio: body.bio,
    image: body.image,
  });
  return new ApiResponse(200, data, "Profile updated");
});

export const deleteMyAccount = asyncHandler(async (req: RequestUser) => {
  const data = await accountService.deleteAccount(String(req.user!.userId));
  return new ApiResponse(200, data, "Account deleted");
});
