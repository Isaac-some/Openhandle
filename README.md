# Openhandle Agent Workflow Builder

Agent 工作流编排交互原型，用于验证算子连接、条件分流、表达式筛选、二路聚合以及最终数据守恒。

## 主要能力

- 1–10 条顺序条件规则，并强制保留 `Else` 兜底
- `保留 / 筛除` 双出口表达式筛选
- 严格字段结构校验的二路聚合
- 多线路结束节点与数据守恒校验
- 可复用 Flow、节点配置、字段映射和本地草稿

## 本地运行

```bash
cd Openhandle
npm install
npm run dev
```

默认访问 `http://127.0.0.1:3000/`。

## 验证

```bash
cd Openhandle
npm test
npm run lint
npm run build
```
