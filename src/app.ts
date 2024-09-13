import express from "express";
import cors from "cors";
import mongoose from "mongoose";

//Global Error Handler
import { ErrorHandler } from "./middlewares/errorHandler.middleware";
import { RouteErrorHandler } from "./middlewares/routeErrorHandler.middleware";

// routs import
import helloWorldRouter from "./routes/hello.route";
import authRouter from "./routes/auth.route";
import categoryRouter from "./routes/categories.route";
import packagesRouter from "./routes/packages.route";
import teamRouter from "./routes/teams.route";
import OrganizationsRouter from "./routes/organizations.route";
import ChatRouter from "./routes/chat.route"

// middleware
import { VerifyUserHandler } from "./middlewares/verifyUser.middleware";
const app = express();

//Use of CORS
app.use(cors());

//Use of Express JSON CONFIG
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true }));

type CustomExpress = {
  run: () => void;
} & typeof app;

//routes declaration
app.use("/auth", authRouter);
app.use("/packages", packagesRouter);
app.use("/categories", categoryRouter);
app.use("/organizations", VerifyUserHandler, OrganizationsRouter);
app.use("/teams", VerifyUserHandler, teamRouter);
app.use("/", helloWorldRouter);
app.use("/chat", VerifyUserHandler, ChatRouter);

// Invalid Path Error Handler
app.use(RouteErrorHandler);
// Error handler MiddleWare
app.use(ErrorHandler);

(app as CustomExpress).run = async () => {
  try {
    mongoose.connect(process.env.DB_URI!);
    mongoose.connection.on("connected", () => {
      console.log("DB_CONNECTED");
    });
    app.listen(process.env.PORT ?? 6000, () => {
      console.log(
        "⚙️",
        ` Server is running at port : ${process.env.PORT ?? 6000}`
      );
    });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
};

export default app as CustomExpress;
