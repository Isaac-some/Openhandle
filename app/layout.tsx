import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent 编排工作台',
  description: '组合真实业务算子和平台控制节点，校验字段来源并生成仅自己可见的 Batch 工作流。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
