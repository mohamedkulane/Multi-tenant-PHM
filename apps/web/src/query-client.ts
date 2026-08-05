import { MutationCache, QueryClient } from "@tanstack/react-query";
import { errorMessage } from "./api/client";
import { showToast } from "./components/toast";

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      showToast({
        title: "Hawshu ma dhammaan",
        message: errorMessage(error),
        tone: "error",
        durationMs: 7_000,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
