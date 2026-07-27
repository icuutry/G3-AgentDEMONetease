# AI Car Loan Agent 后端

这是根据 `f2.html`、前后端对接 PDF 和两份 Word 说明实现的后端工程。它以 FastAPI + SQLite 提供完整演示闭环：

`Applicant 新建/保存/提交 → 后端校验 → 风险评估 → Officer 批准/拒绝/要求补件 → Applicant 补件 → 状态同步 → 审计追踪`

## 已实现

- 固定演示账号登录与角色权限
- 申请 CRUD、草稿锁定和申请人数据隔离
- `draft / submitted / reviewing / need_info / approved / rejected` 状态机
- 与 `f2.html` 一致的 LTV、DSR、首付、收入差异、任职、逾期、车龄、重复申请规则
- 每次持久化评估保存规则版本、模型版本、分数、指标、因素、规则、问题和硬规则
- 人工决定强制填写备注，同时保留 AI 评估和人工最终决定
- 补件说明及文件元数据保存（不做 OCR）
- 追加式审计日志
- 5 个演示案件，风险分约为 Low 23、Medium 54、High 77
- Swagger / OpenAPI 文档

## 目录

```text
backend/
  app/
    auth.py          固定演示账号和角色守卫
    config.py        数据库、CORS、演示数据配置
    database.py      SQLAlchemy 引擎与会话
    main.py          FastAPI 路由
    models.py        SQLite 表模型
    risk_engine.py   确定性风险规则引擎
    schemas.py       请求/响应 JSON 契约
    seed.py          5 个演示案件
    service.py       状态机、审计和业务逻辑
  tests/             风险引擎与端到端 API 测试
  requirements.txt
  run.ps1
```

## 启动

在 PowerShell 中进入 `backend`：

```powershell
.\run.ps1
```

首次运行会创建 `.venv`、安装依赖、初始化 `car_loan_agent.db`，然后启动：

- API: `http://127.0.0.1:8000`
- Swagger: `http://127.0.0.1:8000/docs`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

## 与 index_api.html 联合演示

`index_api.html` 应与原 `index.html` 并列放在 `Agent` 根目录。原文件保留为纯前端离线版本，新文件使用本后端和 SQLite。

1. 先在 `Agent\backend` 运行 `.\run.ps1`。
2. 使用 VS Code Live Server 打开 `Agent\index_api.html`。
3. 推荐地址为 `http://127.0.0.1:5500/index_api.html`。
4. 页面顶部出现“后端 API 已连接”后即可登录。

不要直接双击并通过 `file://` 打开 API 版本，否则浏览器的 Origin/CORS 行为可能阻止请求。默认后端地址为 `http://127.0.0.1:8000`；部署时可在加载页面前设置 `window.CAR_LOAN_API_BASE` 覆盖。

也可以手工启动：

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

## 演示账号

| 角色 | 账号 | 密码 | Token |
|---|---|---|---|
| Applicant | `applicant@demo.com` | `demo123` | `demo-applicant-token` |
| Officer | `officer@demo.com` / `Officer01` | `demo123` | `demo-officer-token` |

登录后发送：

```http
Authorization: Bearer demo-applicant-token
```

为了便于现有单文件 HTML 快速联调，也支持请求头 `X-Demo-Role: applicant` 或 `X-Demo-Role: officer`。正式系统应替换成 JWT/OIDC。

## 核心接口

| Method | Endpoint | 角色 | 用途 |
|---|---|---|---|
| POST | `/auth/login` | Public | 演示登录 |
| GET | `/auth/me` | Both | 当前用户 |
| POST | `/applications` | Applicant | 新建申请 |
| GET | `/applications` | Both | 申请人列表或审批队列 |
| GET | `/applications/{id}` | Both | 申请及最新评估详情 |
| PATCH | `/applications/{id}` | Applicant | 保存/修改草稿 |
| POST | `/applications/{id}/submit` | Applicant | 提交、校验并自动评估 |
| GET | `/applications/{id}/risk-assessment` | Both | 实时评估 |
| POST | `/applications/{id}/evaluate` | Officer | 持久评估或参数预演 |
| POST | `/applications/{id}/decision` | Officer | 批准、拒绝、要求补件 |
| POST | `/applications/{id}/supplements` | Applicant | 提交补件说明和文件元数据 |
| GET | `/audit-logs` | Both | 查询可见审计记录 |
| POST | `/demo/reset` | Officer | 恢复演示数据 |

`GET /applications` 支持 `status`、`riskLevel`、`search` 查询参数。`GET /audit-logs` 支持 `applicationId`。

## 前端字段与响应约定

申请字段保持 `f2.html` 的 camelCase 命名，例如：

```json
{
  "consent": true,
  "name": "Test Applicant",
  "nric": "S8••••99Z",
  "empMonths": 20,
  "incomeDeclared": 6000,
  "incomeVerified": 6000,
  "existingMonthly": 500,
  "latePayments": 0,
  "carPrice": 115000,
  "omv": 17000,
  "downPayment": 43700,
  "loanAmount": 71300,
  "tenureYears": 5
}
```

风险输出使用稳定 code/value，不返回界面中文：

```json
{
  "score": 23,
  "level": "low",
  "recommendation": "approve",
  "metrics": {
    "ltv": 0.62,
    "cap": 0.7,
    "dsr": 0.32,
    "downPaymentRatio": 0.38,
    "incomeGap": 0,
    "monthlyPayment": 1424.91
  },
  "factors": [],
  "rules": [],
  "questions": [],
  "hardRules": [],
  "rulesVersion": "rules-v1.0.0",
  "modelVersion": "deterministic-score-v1.0.0"
}
```

前端应负责把 `approved`、`high`、`income_gap_above_30` 等 code 映射成英文或中文显示文字。

## 现有 HTML 的最小改造方向

1. 将 `load()` / `save()` 的全量 `localStorage` 操作替换为资源接口。
2. `newApplication()` 调用 `POST /applications`。
3. 保存草稿调用 `PATCH /applications/{id}`。
4. `submitApp()` 调用 `POST /applications/{id}/submit`，不要再在浏览器执行可信风险评估。
5. Officer 队列调用 `GET /applications`；详情调用 `GET /applications/{id}`。
6. `commit()` 调用 `POST /applications/{id}/decision`。
7. 补件调用 `POST /applications/{id}/supplements`。
8. 审计页面调用 `GET /audit-logs`。

## 测试

安装开发依赖后：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest
```

测试覆盖三档预设分数、LTV 硬规则、登录与权限、提交、补件、人工决定、审计和不落库的参数预演。

## 演示范围说明

这是教学/演示系统，所有数据和规则均为合成或模拟内容，不代表真实金融机构政策。当前未实现真实 Singpass/MyInfo/征信、真实文件存储、OCR、注册、JWT 或生产级密钥管理。
