import { config } from "./src/config/dot.env";
config();
import app from "./src/app";
app.run();