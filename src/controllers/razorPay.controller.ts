import { PlansModel } from "../models/plan.model";
import Subscriptions from "../models/subscription.model";
import { RequestUser } from "../types/user";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import razorpayInstance from "../utils/razorpayInstance";

// creating a razor-pay subscription 
export const buySubscription = asyncHandler(async (req : RequestUser)=>{


    const subscription = await razorpayInstance.subscriptions.create({
        plan_id : req.body.plan_id,
        customer_notify : 1 ,
        quantity : 1 ,
        total_count : 1 // is for 1 means montly  , 12 means yearly 6 means 6 month 
        // customer_id : req.body.customer_id,
        // quantity : req.body.quantity,
        // currency : req.body.currency,
        // description : req.body.description,
        // notes : req.body.notes,
    });
    const createUserSubscription = await Subscriptions.create({
        subscriptionId: subscription.id,
        customerId: subscription.customer_id,
        planId: subscription.plan_id,
        status: subscription.status,
    });

});


// for Plans 
export const getRazorPayPlans  = asyncHandler(async (req : RequestUser)=>{
    // const palns = await razorpayInstance.plans.all();
    const plans = await PlansModel.find({});
    return new ApiResponse(200,plans , "RazorPay Plans fetched successfully")
});
export const createRazorPayPlan = asyncHandler(async (req : RequestUser)=>{
    const { plan_id } = req.body;

    if(!plan_id) throw new ApiError("Plan ID is required", 400);

    const plan = await razorpayInstance.plans.fetch(plan_id) ;
    const newPlan = await PlansModel.create({ plan_id : plan_id ,razorpayPlanItem: plan}) ;
    return new ApiResponse(200,newPlan , "RazorPay Plan created successfully");
});
export const deleteRazorPayPlan = asyncHandler(async (req : RequestUser)=>{
    const { plan_id } = req.params;

    if(!plan_id) throw new ApiError("Plan ID is required", 400);

    await PlansModel.findByIdAndDelete(plan_id);
    return new ApiResponse(200,null , "RazorPay Plan deleted successfully");
});
