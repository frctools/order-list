import { useAuth } from "../../utils/auth";

export default defineEventHandler((event) => {
  return useAuth().handler(toWebRequest(event));
});
