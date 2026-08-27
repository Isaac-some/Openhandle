/* eslint-disable @next/next/no-img-element */
import type { CSSProperties, ImgHTMLAttributes } from "react";

type StaticImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  alt: string;
  fill?: boolean;
};

export default function StaticImage({ src, fill, style, ...props }: StaticImageProps) {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const resolvedSrc = src.startsWith("/") ? `${baseUrl}${src.slice(1)}` : src;
  const fillStyle: CSSProperties | undefined = fill
    ? { position: "absolute", width: "100%", height: "100%", inset: 0, ...style }
    : style;

  return <img {...props} src={resolvedSrc} style={fillStyle} />;
}
