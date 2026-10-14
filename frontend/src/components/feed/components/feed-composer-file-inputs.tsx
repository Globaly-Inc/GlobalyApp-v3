"use client";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";

export function FeedComposerFileInputs({
  imageInput,
  videoInput,
  pickFiles,
}: Readonly<{
  imageInput: React.RefObject<HTMLInputElement | null>;
  videoInput: React.RefObject<HTMLInputElement | null>;
  pickFiles: (files: FileList | null) => Promise<void>;
}>) {
  return (
    <>
      <input
        ref={imageInput}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          void pickFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept={VIDEO_ACCEPT}
        hidden
        onChange={(event) => {
          void pickFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </>
  );
}
