const path = require("path");
const express = require("express");
const { createMockMiddleware } = require("openapi-mock-express-middleware");
const swaggerUi = require("swagger-ui-express");

// 실행 위치와 상관없이 docs/swagger.json을 찾도록 이 파일 기준 경로를 쓴다.
const specPath = path.join(__dirname, "../docs/swagger.json");
const swaggerDoc = require(specPath);
const app = express();

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));
// swagger.json의 경로가 이미 /api로 시작하므로 앞에 /api를 붙이지 않고 연결한다.
app.use(createMockMiddleware({ spec: specPath }));

// 포트는 swagger.json servers의 http://localhost:3000을 따른다.
app.listen(3000);
