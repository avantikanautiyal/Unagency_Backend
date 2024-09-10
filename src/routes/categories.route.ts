import { Router } from "express";
import { createCategory, fetchCategories } from "../controllers/categories.controller";
import { fileUpload } from "../middlewares/multers3.middleware";

const router = Router();
router.post("/", fileUpload.single("featuredImage"), createCategory);
router.get('/', fetchCategories);
// router.get('/categories/title/:title', getCategoryByTitle);
// router.put('/categories/:id', updateCategory);
// router.delete('/categories/:id', deleteCategory);

export default router;
