#!/usr/bin/env node

const { createHmac, randomUUID } = require('node:crypto');
const mysql = require('mysql2/promise');
const { createClient } = require('redis');

const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://localhost:4010/api').replace(/\/$/, '');
const databaseUrl =
  process.env.DATABASE_URL ?? 'mysql://jshsus:local_password@localhost:3307/jshsus';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/0';
const csrfSecret = process.env.CSRF_SECRET ?? 'change-this-csrf-secret';
const adminStudentNo = Number(
  process.env.SMOKE_ADMIN_STUDENT_NO ?? process.env.LEGACY_SYSTEM_ADMIN_STUIDS ?? 9988,
);

const cleanupTasks = [];
const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function csrfToken(token) {
  return createHmac('sha256', csrfSecret).update(token).digest('hex');
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.csrf ? { 'x-csrf-token': options.csrf } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed (${response.status}): ${text}`);
  }

  return data;
}

async function createSession(redis, input) {
  const token = randomUUID();
  const payload = {
    iamId: input.userId,
    userId: input.userId,
    plmaId: 0,
    permissions: input.roles,
    roles: input.roles,
    expiresAt: Date.now() + 60 * 60 * 1000,
    stuid: input.studentNo,
    name: input.name,
    isLogined: true,
  };

  await redis.setEx(`iam_token:${token}`, 3600, JSON.stringify(payload));
  cleanupTasks.push(async () => redis.del(`iam_token:${token}`));

  return {
    token,
    csrf: csrfToken(token),
  };
}

async function queryOne(connection, sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return rows[0] ?? null;
}

async function queryAll(connection, sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return rows;
}

async function cleanup(connection, redis) {
  for (const task of cleanupTasks.reverse()) {
    try {
      await task(connection, redis);
    } catch (error) {
      console.warn(`cleanup warning: ${error.message}`);
    }
  }
}

async function main() {
  const health = await request('/health');
  assert(health.status === 'ok', 'API health check failed');

  const connection = await mysql.createConnection(databaseUrl);
  const redis = createClient({ url: redisUrl });
  await redis.connect();

  try {
    const admin = await queryOne(
      connection,
      'select id, student_no as studentNo from users where student_no = ? limit 1',
      [adminStudentNo],
    );
    assert(admin, 'Smoke admin user was not found. Import legacy users first.');

    const students = await queryAll(
      connection,
      `select s.id as studentId, s.user_id as userId, s.student_no as studentNo, s.current_point as currentPoint
       from students s
       where s.user_id is not null and s.student_no <> ?
       order by s.id
       limit 2`,
      [adminStudentNo],
    );
    assert(students.length >= 2, 'At least two linked student users are required for smoke tests.');

    const adminAuth = await createSession(redis, {
      userId: admin.id,
      studentNo: admin.studentNo,
      roles: ['system_admin'],
      name: 'smoke-admin',
    });
    const studentAuth = await createSession(redis, {
      userId: students[0].userId,
      studentNo: students[0].studentNo,
      roles: ['student'],
      name: 'smoke-student',
    });
    const secondStudentAuth = await createSession(redis, {
      userId: students[1].userId,
      studentNo: students[1].studentNo,
      roles: ['student'],
      name: 'smoke-student-2',
    });

    const adminPost = (path, body) =>
      request(path, { method: 'POST', token: adminAuth.token, csrf: adminAuth.csrf, body });
    const adminPut = (path, body) =>
      request(path, { method: 'PUT', token: adminAuth.token, csrf: adminAuth.csrf, body });
    const adminDelete = (path) =>
      request(path, { method: 'DELETE', token: adminAuth.token, csrf: adminAuth.csrf });
    const studentPost = (path, body) =>
      request(path, { method: 'POST', token: studentAuth.token, csrf: studentAuth.csrf, body });
    const secondStudentPost = (path, body) =>
      request(path, {
        method: 'POST',
        token: secondStudentAuth.token,
        csrf: secondStudentAuth.csrf,
        body,
      });

    const beforePoint = Number(students[0].currentPoint);
    const reason = await adminPost('/admin/points/reasons', {
      type: 'PLUS',
      point: 1,
      comment: `smoke reason ${Date.now()}`,
    });
    const reasonId = reason.reason.id;
    cleanupTasks.push((db) => db.execute('delete from point_reasons where id = ?', [reasonId]));

    const pointRecord = await adminPost('/admin/points/records', {
      studentId: students[0].studentId,
      reasonId,
      comment: 'smoke point record',
      baseDate: new Date().toISOString().slice(0, 10),
    });
    const pointRecordId = pointRecord.record.id;
    cleanupTasks.push(async (db) => {
      await db.execute('delete from point_adjustments where point_record_id = ?', [pointRecordId]);
      await db.execute('delete from point_records where id = ?', [pointRecordId]);
    });

    await adminPost(`/admin/points/records/${pointRecordId}/cancel`, { reason: 'smoke cleanup' });
    const afterPoint = await queryOne(
      connection,
      'select current_point as currentPoint from students where id = ?',
      [students[0].studentId],
    );
    assert(
      Number(afterPoint.currentPoint) === beforePoint,
      'Point cancel did not restore the student current point.',
    );
    results.push('points=ok');

    const commands = await request('/admin/device-cases/1/commands', { token: adminAuth.token });
    assert(Array.isArray(commands), 'Device command history response is not an array.');
    results.push('deviceCases=ok');

    const room = await queryOne(connection, 'select id from dorm_rooms order by id limit 1');
    assert(room, 'Dorm room was not found.');
    const assignment = await adminPost('/admin/dorm/assignments', {
      roomId: room.id,
      userId: students[0].userId,
      year: 2099,
      semester: 1,
      bedPosition: 1,
    });
    cleanupTasks.push((db) =>
      db.execute('delete from dorm_assignments where id = ?', [assignment.assignment.id]),
    );
    const [reportResult] = await connection.execute(
      `insert into dorm_reports (user_id, room_id, description, dorm_report_status)
       values (?, ?, ?, 'PENDING')`,
      [students[0].userId, room.id, 'smoke dorm report'],
    );
    const reportId = reportResult.insertId;
    cleanupTasks.push((db) => db.execute('delete from dorm_reports where id = ?', [reportId]));
    const report = await adminPut(`/admin/dorm/reports/${reportId}/status`, {
      status: 'PROCESSING',
    });
    assert(report.status === 'PROCESSING', 'Dorm report status update failed.');
    results.push('dorm=ok');

    const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const activity = await studentPost('/activity-requests', {
      location: 'smoke lab',
      startsAt,
      endsAt,
      purpose: 'smoke activity',
    });
    const activityId = activity.request.id;
    cleanupTasks.push(async (db) => {
      await db.execute('delete from activity_request_events where activity_request_id = ?', [
        activityId,
      ]);
      await db.execute('delete from activity_requests where id = ?', [activityId]);
    });
    const approved = await adminPost(`/admin/activity-requests/${activityId}/approve`);
    assert(
      approved.status === 'approved' && approved.issuedNumber,
      'Activity approval did not issue a number.',
    );
    const printed = await adminPost(`/admin/activity-requests/${activityId}/print`);
    assert(printed.ok === true, 'Activity print marker failed.');
    results.push('activityRequests=ok');

    const petition = await studentPost('/petitions', {
      title: `smoke petition ${Date.now()}`,
      content: 'smoke petition content',
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const petitionId = petition.petition.id;
    cleanupTasks.push(async (db) => {
      await db.execute('delete from petition_answers where petition_id = ?', [petitionId]);
      await db.execute('delete from petition_participants where petition_id = ?', [petitionId]);
      await db.execute('delete from petitions where id = ?', [petitionId]);
    });
    await connection.execute('update petitions set participant_count = 48 where id = ?', [
      petitionId,
    ]);
    const firstParticipation = await studentPost(`/petitions/${petitionId}/participate`);
    assert(firstParticipation.participated === true, 'First petition participation failed.');
    const duplicateParticipation = await studentPost(`/petitions/${petitionId}/participate`);
    assert(
      duplicateParticipation.participated === false,
      'Duplicate petition participation was not ignored.',
    );
    const secondParticipation = await secondStudentPost(`/petitions/${petitionId}/participate`);
    assert(
      secondParticipation.status === 'awaiting_answer',
      'Petition did not enter awaiting_answer at threshold.',
    );
    const answer = await adminPost(`/admin/petitions/${petitionId}/answer`, {
      content: 'smoke answer',
    });
    assert(answer.ok === true, 'Petition answer failed.');
    results.push('petitions=ok');

    const smokeBoardSlug = 'free';
    const post = await studentPost(`/boards/${smokeBoardSlug}/posts`, {
      title: 'smoke board post',
      content: 'smoke board content',
      isAnonymous: false,
    });
    const postId = post.post.id;
    cleanupTasks.push(async (db) => {
      await db.execute('delete from posts where id = ?', [postId]);
    });
    const posts = await request(`/boards/${smokeBoardSlug}/posts`, { token: studentAuth.token });
    assert(
      posts.items.some((item) => item.id === postId),
      'Created board post was not listed.',
    );
    const postDetail = await request(`/boards/${smokeBoardSlug}/posts/${postId}`, {
      token: studentAuth.token,
    });
    assert(
      postDetail.id === postId && postDetail.viewCount >= 1,
      'Created board post detail was not returned.',
    );
    const comment = await studentPost(`/boards/${smokeBoardSlug}/posts/${postId}/comments`, {
      content: 'smoke board comment',
    });
    const commentId = comment.comment.id;
    cleanupTasks.push((db) => db.execute('delete from comments where id = ?', [commentId]));
    const comments = await request(`/boards/${smokeBoardSlug}/posts/${postId}/comments`, {
      token: studentAuth.token,
    });
    assert(
      comments.some((item) => item.id === commentId),
      'Created board comment was not listed.',
    );
    const reportPost = await studentPost('/reports', {
      targetType: 'post',
      targetId: postId,
      reason: 'smoke report',
      detail: 'smoke report detail',
    });
    cleanupTasks.push((db) =>
      db.execute('delete from reports where id = ?', [reportPost.report.id]),
    );
    const hiddenPost = await adminPut(`/admin/boards/posts/${postId}/hidden`, { isHidden: true });
    assert(hiddenPost.isHidden === true, 'Post hide failed.');
    const shownPost = await adminPut(`/admin/boards/posts/${postId}/hidden`, { isHidden: false });
    assert(shownPost.isHidden === false, 'Post show failed.');
    const hiddenComment = await adminPut(`/admin/boards/comments/${commentId}/hidden`, {
      isHidden: true,
    });
    assert(hiddenComment.isHidden === true, 'Comment hide failed.');
    await adminPut(`/admin/reports/${reportPost.report.id}/status`, { status: 'closed' });
    const uploaded = await studentPost('/files', {
      originalName: 'smoke.png',
      mimeType: 'image/png',
      dataBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      targetType: 'post',
      targetId: postId,
      visibility: 'public',
    });
    cleanupTasks.push((db) => db.execute('delete from files where id = ?', [uploaded.file.id]));
    assert(uploaded.file.url, 'File upload did not return a URL.');

    const lostItem = await studentPost('/lost-items', {
      type: 'found',
      itemName: 'smoke lost item',
      location: 'smoke location',
      description: 'smoke lost item description',
    });
    const lostItemId = lostItem.lostItem.id;
    cleanupTasks.push((db) => db.execute('delete from lost_items where id = ?', [lostItemId]));
    const lostItems = await request('/lost-items', { token: studentAuth.token });
    assert(
      lostItems.some((item) => item.id === lostItemId),
      'Created lost item was not listed.',
    );
    const lostStatus = await adminPut(`/admin/lost-items/${lostItemId}/status`, {
      status: 'matched',
    });
    assert(lostStatus.status === 'matched', 'Lost item status update failed.');
    const notice = await adminPost('/admin/notices', {
      title: `smoke notice ${Date.now()}`,
      content: 'smoke notice content',
      department: 'smoke',
      pinned: false,
    });
    const noticeId = notice.notice.id;
    cleanupTasks.push((db) => db.execute('delete from notices where id = ?', [noticeId]));
    await adminPut(`/admin/notices/${noticeId}`, { pinned: true });
    await adminDelete(`/admin/notices/${noticeId}`);
    results.push('content=ok');

    const [adminStudents, staff, roles, auditLogs] = await Promise.all([
      request('/admin/students', { token: adminAuth.token }),
      request('/admin/staff', { token: adminAuth.token }),
      request('/admin/iam/roles', { token: adminAuth.token }),
      request('/admin/audit-logs', { token: adminAuth.token }),
    ]);
    assert(
      Array.isArray(adminStudents) && adminStudents.length >= 2,
      'Admin students endpoint failed.',
    );
    assert(Array.isArray(staff), 'Admin staff endpoint failed.');
    assert(Array.isArray(roles), 'IAM roles endpoint failed.');
    assert(Array.isArray(auditLogs), 'Audit logs endpoint failed.');

    const smokeNo = 880000 + Math.floor(Date.now() % 100000);
    const createdStudent = await adminPost('/admin/students', {
      studentNo: smokeNo,
      name: 'smoke student admin',
      grade: 1,
      classNo: 1,
      number: 1,
    });
    cleanupTasks.push(async (db) => {
      await db.execute('delete from user_roles where user_id = ?', [createdStudent.userId]);
      await db.execute('delete from students where id = ?', [createdStudent.studentId]);
      await db.execute('delete from users where id = ?', [createdStudent.userId]);
    });
    await adminPut(`/admin/students/${createdStudent.studentId}`, { number: 2 });
    const createdStaff = await adminPost('/admin/staff', {
      staffNo: smokeNo + 1,
      name: 'smoke staff admin',
      department: 'smoke',
      title: 'teacher',
      isStudentAffairsHead: false,
    });
    cleanupTasks.push(async (db) => {
      await db.execute('delete from staff_profiles where id = ?', [createdStaff.staffId]);
      await db.execute('delete from users where id = ?', [createdStaff.userId]);
    });
    await adminPut(`/admin/staff/${createdStaff.staffId}`, { title: 'updated teacher' });
    const createdRole = await adminPost('/admin/iam/roles', {
      name: `smoke_role_${Date.now()}`,
      label: 'Smoke Role',
    });
    const roleId = createdRole.role.id;
    cleanupTasks.push(async (db) => {
      await db.execute('delete from role_permissions where role_id = ?', [roleId]);
      await db.execute('delete from user_roles where role_id = ?', [roleId]);
      await db.execute('delete from roles where id = ?', [roleId]);
    });
    const createdPermission = await adminPost('/admin/iam/permissions', {
      name: `smoke.permission.${Date.now()}`,
      label: 'Smoke Permission',
      description: 'smoke permission',
    });
    const permissionId = createdPermission.permission.id;
    cleanupTasks.push(async (db) => {
      await db.execute('delete from role_permissions where permission_id = ?', [permissionId]);
      await db.execute('delete from permissions where id = ?', [permissionId]);
    });
    await adminPut(`/admin/iam/roles/${roleId}/permissions`, { ids: [permissionId] });
    const rolePermissions = await request(`/admin/iam/roles/${roleId}/permissions`, {
      token: adminAuth.token,
    });
    assert(rolePermissions.includes(permissionId), 'Role permission assignment failed.');
    await adminPut(`/admin/users/${createdStudent.userId}/roles`, { ids: [roleId] });
    const userRoles = await request(`/admin/users/${createdStudent.userId}/roles`, {
      token: adminAuth.token,
    });
    assert(userRoles.includes(roleId), 'User role assignment failed.');
    results.push('adminOps=ok');

    const myStatus = await request('/me/status', { token: studentAuth.token });
    assert(
      myStatus.student?.id === students[0].studentId,
      'Student self status did not resolve the session student.',
    );
    assert(
      Number.isFinite(myStatus.points?.currentPoint),
      'Student self status did not include point summary.',
    );
    results.push('myStatus=ok');

    console.log(['core-smoke=ok', ...results].join('\n'));
  } finally {
    await cleanup(connection, redis);
    await redis.quit();
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`core-smoke=failed\n${error.stack ?? error.message}`);
  process.exit(1);
});
