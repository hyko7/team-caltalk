-- Team CalTalk 데이터베이스 스키마 (PostgreSQL 18)
-- 근거: docs/7-erd.md v0.2
-- 모든 일시는 UTC(timestamptz)로 저장한다 (ERD-미결-3).
-- 한 트랜잭션으로 실행해 중간에 실패하면 아무것도 만들어지지 않게 한다.

BEGIN;

-- 사용자 (BR-16, NFR-04)
CREATE TABLE users (
    id            bigint GENERATED ALWAYS AS IDENTITY,
    email         text NOT NULL,
    password_hash text NOT NULL,
    name          text NOT NULL,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email)
);

-- 팀 (BR-12, BR-18). creator_id는 기록용이며 팀장 판단에는 쓰지 않는다.
CREATE TABLE teams (
    id          bigint GENERATED ALWAYS AS IDENTITY,
    name        text NOT NULL,
    invite_code text NOT NULL,
    creator_id  bigint NOT NULL,
    CONSTRAINT teams_pkey PRIMARY KEY (id),
    CONSTRAINT teams_invite_code_key UNIQUE (invite_code),
    CONSTRAINT teams_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users (id)
);

-- 팀 소속 (BR-10, UC-10). 팀장 여부는 role로만 판단한다 (NFR-03).
CREATE TABLE team_memberships (
    id      bigint GENERATED ALWAYS AS IDENTITY,
    user_id bigint NOT NULL,
    team_id bigint NOT NULL,
    role    text NOT NULL,
    CONSTRAINT team_memberships_pkey PRIMARY KEY (id),
    CONSTRAINT team_memberships_user_id_team_id_key UNIQUE (user_id, team_id),
    CONSTRAINT team_memberships_role_check CHECK (role IN ('leader', 'member')),
    CONSTRAINT team_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT team_memberships_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams (id)
);

-- 채팅방. 팀당 1개 (BR-17).
CREATE TABLE chat_rooms (
    id      bigint GENERATED ALWAYS AS IDENTITY,
    team_id bigint NOT NULL,
    CONSTRAINT chat_rooms_pkey PRIMARY KEY (id),
    CONSTRAINT chat_rooms_team_id_key UNIQUE (team_id),
    CONSTRAINT chat_rooms_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams (id)
);

-- 팀 일정 (BR-14, BR-15). 삭제는 is_deleted로만 표시한다.
-- updater_id, updated_at은 수정 전에는 NULL이다 (제안).
CREATE TABLE schedules (
    id         bigint GENERATED ALWAYS AS IDENTITY,
    team_id    bigint NOT NULL,
    title      text NOT NULL,
    start_at   timestamptz NOT NULL,
    end_at     timestamptz NOT NULL,
    creator_id bigint NOT NULL,
    updater_id bigint,
    updated_at timestamptz,
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT schedules_pkey PRIMARY KEY (id),
    CONSTRAINT schedules_end_at_check CHECK (end_at >= start_at),
    CONSTRAINT schedules_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams (id),
    CONSTRAINT schedules_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users (id),
    CONSTRAINT schedules_updater_id_fkey FOREIGN KEY (updater_id) REFERENCES users (id)
);

-- 관련 팀원 (BR-13). 같은 팀의 member만 지정하는 규칙은 서비스에서 검사한다.
CREATE TABLE schedule_participants (
    schedule_id        bigint NOT NULL,
    team_membership_id bigint NOT NULL,
    CONSTRAINT schedule_participants_pkey PRIMARY KEY (schedule_id, team_membership_id),
    CONSTRAINT schedule_participants_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules (id),
    CONSTRAINT schedule_participants_team_membership_id_fkey FOREIGN KEY (team_membership_id) REFERENCES team_memberships (id)
);

-- 메시지. 일정 변경 요청은 type = 'change_request'인 메시지다 (BR-05, BR-06).
-- 처리 상태 컬럼은 두지 않는다. 대상 일정이 삭제돼도 참조는 남는다 (BR-15).
CREATE TABLE messages (
    id                 bigint GENERATED ALWAYS AS IDENTITY,
    chat_room_id       bigint NOT NULL,
    author_id          bigint NOT NULL,
    content            text NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    type               text NOT NULL,
    target_schedule_id bigint,
    CONSTRAINT messages_pkey PRIMARY KEY (id),
    CONSTRAINT messages_type_check CHECK (type IN ('normal', 'change_request')),
    CONSTRAINT messages_target_schedule_id_check CHECK (
        (type = 'change_request' AND target_schedule_id IS NOT NULL)
        OR (type = 'normal' AND target_schedule_id IS NULL)
    ),
    CONSTRAINT messages_chat_room_id_fkey FOREIGN KEY (chat_room_id) REFERENCES chat_rooms (id),
    CONSTRAINT messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES users (id),
    CONSTRAINT messages_target_schedule_id_fkey FOREIGN KEY (target_schedule_id) REFERENCES schedules (id)
);

-- 인덱스 (T4-7). UNIQUE와 PK는 PostgreSQL이 인덱스를 자동으로 만든다.
CREATE INDEX messages_chat_room_id_created_at_idx ON messages (chat_room_id, created_at);
CREATE INDEX schedules_team_id_start_at_end_at_idx ON schedules (team_id, start_at, end_at);

COMMIT;
