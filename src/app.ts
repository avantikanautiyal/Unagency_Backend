import express from "express";
import cors from "cors";

//Global Error Handler
import { ErrorHandler } from "./middlewares/errorHandler.middleware";
import { RouteErrorHandler } from "./middlewares/routeErrorHandler.middleware";

// routs import
import helloWorldRouter from "./routes/hello.route";
import authRouter from "./routes/auth.route";
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
app.use("/", helloWorldRouter);

// Invalid Path Error Handler
app.use(RouteErrorHandler);
// Error handler MiddleWare
app.use(ErrorHandler);

(app as CustomExpress).run = async () => {
  try {
    //  ADD you pre run code here
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
