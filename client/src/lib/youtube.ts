// Shared loader for YouTube's IFrame Player API (loaded once, on demand).

export interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number; endSeconds?: number }): void;
  getCurrentTime(): number;
  pauseVideo(): void;
  destroy(): void;
}

export interface YTPlayerOptions {
  videoId?: string;
  host?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: () => void;
    onError?: (e: { data: number }) => void;
  };
}

interface YTNamespace {
  Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

export function loadYouTube(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      document.head.appendChild(s);
    }
  });
  return loading;
}

/** Player options shared by every embed: privacy-enhanced host, no related videos. */
export const PLAYER_DEFAULTS = {
  host: "https://www.youtube-nocookie.com",
  playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
};

/** Human message for the IFrame API's error codes. */
export const ytError = (code: number) =>
  code === 100
    ? "This video was removed or made private."
    : code === 101 || code === 150
      ? "The owner doesn't allow this video to play on other sites."
      : "YouTube couldn't play this video.";
