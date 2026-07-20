export type NotificationType =
  | 'point_awarded'
  | 'activity_request_submitted'
  | 'activity_request_approved'
  | 'activity_request_rejected';

export type NotificationMetadata = Record<string, unknown>;

export type NotificationItem = {
  id: number;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: NotificationMetadata;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  expiresAt: string;
};

export type NotificationListResponse = {
  items: NotificationItem[];
  unreadCount: number;
};

export type DashboardNotice = {
  id: number;
  title: string;
  department: string;
  pinned: boolean;
  publishedAt: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ContentSearchField = 'title_content' | 'title' | 'author';

export type NoticeListItem = {
  id: number;
  title: string;
  department: string;
  pinned: boolean;
  viewCount: number;
  publishedAt: string;
};

export type NoticeDetail = NoticeListItem & {
  content: string;
  attachments: UploadedFileSummary[];
};

export type NoticeSummary = DashboardNotice & {
  content: string;
  viewCount: number;
  attachments?: UploadedFileSummary[];
};

export type DashboardPetition = {
  id: number;
  title: string;
  participantCount: number;
  threshold: number;
  startsAt: string;
  endsAt: string;
  status: 'open' | 'awaiting_answer' | 'answered' | 'expired' | 'hidden';
};

export type PetitionAnswerSummary = {
  content: string;
  authorName?: string;
  answeredAt: string;
};

export type PetitionSummary = DashboardPetition & {
  content: string;
  contentDoc?: RichTextDocument;
  authorName?: string;
  startsAt: string;
  answer?: PetitionAnswerSummary;
};

export type PetitionDetail = PetitionSummary;

export type ThanksChallengeMessage = {
  id: number;
  schoolNumber: string;
  message: string;
  submittedAt: string;
};

export type ThanksChallengeSummary = {
  schoolNumber: string;
  messageCount: number;
};

export type ThanksChallengeData = {
  messages: ThanksChallengeMessage[];
  summary: ThanksChallengeSummary[];
  totalMessages: number;
  totalStudents: number;
};

export type ThanksChallengeCreateResult = {
  ok: true;
  message: ThanksChallengeMessage;
};

export type LostItemSummary = {
  id: number;
  type: 'lost' | 'found';
  itemName: string;
  location: string;
  status: 'PROCESSING' | 'RETURNED';
  description?: string;
  occurredAt?: string;
  authorName?: string;
  attachments?: UploadedFileSummary[];
};

export type LostItemDetail = Omit<LostItemSummary, 'attachments'> & {
  attachments: UploadedFileSummary[];
  canEdit: boolean;
};

export type BoardPostSummary = {
  id: number;
  boardSlug: string;
  title: string;
  content: string;
  contentDoc?: RichTextDocument;
  authorName?: string;
  isAnonymous: boolean;
  isHidden: boolean;
  status: PostStatus;
  viewCount: number;
  commentCount: number;
  createdAt: string;
  attachments?: UploadedFileSummary[];
};

export type PostStatus = 'draft' | 'published';

export type BoardPostListItem = {
  id: number;
  boardSlug: string;
  title: string;
  authorName?: string;
  isAnonymous: boolean;
  viewCount: number;
  commentCount: number;
  createdAt: string;
};

export type BoardPostDetail = BoardPostListItem & {
  content: string;
  contentDoc?: RichTextDocument;
  attachments: UploadedFileSummary[];
  likeCount: number;
  likedByMe: boolean;
};

export type ContentLikeState = {
  liked: boolean;
  likeCount: number;
};

export type RichTextColor = string;
export type RichTextFontSize = string;
export type RichTextFontFamily = string;
export type RichTextHighlight = string;

export type RichTextMark =
  | { type: 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'superscript' | 'subscript' }
  | { type: 'textColor'; attrs: { color: RichTextColor } }
  | { type: 'fontSize'; attrs: { size: RichTextFontSize } }
  | { type: 'fontFamily'; attrs: { family: RichTextFontFamily } }
  | { type: 'highlight'; attrs: { color: RichTextHighlight } }
  | {
      type: 'link';
      attrs: {
        href: string;
        target?: '_blank' | null;
        rel?: string | null;
        class?: null;
      };
    };

export type RichTextNode = {
  type:
    | 'paragraph'
    | 'heading'
    | 'text'
    | 'bulletList'
    | 'orderedList'
    | 'listItem'
    | 'blockquote'
    | 'hardBreak'
    | 'image';
  attrs?: {
    level?: 2 | 3;
    start?: number;
    type?: string | null;
    src?: string;
    alt?: string | null;
    title?: string | null;
  };
  content?: RichTextNode[];
  text?: string;
  marks?: RichTextMark[];
};

export type RichTextDocument = {
  type: 'doc';
  content: RichTextNode[];
};

export type BoardCommentSummary = {
  id: number;
  postId: number;
  parentId?: number;
  authorName?: string;
  content: string;
  isHidden: boolean;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
};

export type ContentReportSummary = {
  id: number;
  targetType: 'post' | 'comment' | 'lost_item';
  targetId: number;
  reporterName?: string;
  reason: string;
  detail?: string;
  status: string;
  createdAt: string;
};

export type UploadedFileSummary = {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  visibility: 'public' | 'private';
  targetType?: string;
  targetId?: number;
  url: string;
  inlineUrl: string;
  uploadedAt: string;
};

export type SchoolMealType = 'breakfast' | 'lunch' | 'dinner' | 'other';

export type SchoolMeal = {
  id: string;
  date: string;
  type: SchoolMealType;
  typeLabel: string;
  dishes: string[];
  calories?: string;
  source: 'neis';
};

export type AcademicEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  description?: string;
  category: string;
  isHoliday: boolean;
  source: 'neis' | 'school';
};

export type SchoolDataAvailability = 'available' | 'partial' | 'unavailable';
export type SchoolDataSourceAvailability = Exclude<SchoolDataAvailability, 'partial'>;

export type SchoolDataMeta = {
  mealDate: string;
  scheduleFrom: string;
  scheduleTo: string;
  availability: SchoolDataAvailability;
  mealAvailability: SchoolDataSourceAvailability;
  calendarAvailability: SchoolDataAvailability;
  neisCalendarAvailability: SchoolDataSourceAvailability;
  schoolEventsAvailability: SchoolDataSourceAvailability;
};

export type ManagedSchoolEvent = Omit<AcademicEvent, 'id' | 'source'> & {
  id: number;
  isPublic: boolean;
};

export type HomeDashboard = {
  notices: DashboardNotice[];
  petitions: DashboardPetition[];
  meals: SchoolMeal[];
  academicEvents: AcademicEvent[];
  boardPosts: BoardPostSummary[];
  schoolData: SchoolDataMeta;
  studentStatus?: StudentStatusSummary;
};

export type SessionUser =
  | {
      isLogined: true;
      iamId: number;
      userId: number;
      plmaId: number;
      stuid?: number;
      /** Student number or site-issued six-digit teacher number shown in the UI. */
      identifier?: string;
      identityType?: 'student' | 'staff' | 'local';
      name?: string;
      jshsus?: string;
      roles?: UserRole[];
      permissions: string[];
    }
  | {
      isLogined: false;
    };

export type KnownUserRole =
  | 'system_admin'
  | 'student_affairs_head'
  | 'teacher'
  | 'student_council'
  | 'broadcast_club'
  | 'student';

// IAM roles are data, not a closed compile-time enum. Keep known roles discoverable
// while allowing a newly-created role to travel through the session unchanged.
export type UserRole = KnownUserRole | (string & {});

export type StudentStatusSummary = {
  pointTotal: number;
  meritPoint: number;
  penaltyPoint: number;
  dormRoom?: string;
  deviceCase?: {
    id: number;
    isOpen: boolean;
    isConnected: boolean;
  };
  latestActivityRequest?: ActivityRequestSummary;
};

export type StudentSelfStatus = {
  student: {
    id: number;
    studentNo: number;
    name: string;
    nickname?: string;
    profileImageUrl?: string;
    grade: number;
    classNo: number;
    number: number;
  };
  points: {
    currentPoint: number;
    meritPoint: number;
    penaltyPoint: number;
    records: PointRecord[];
  };
  dorm?: {
    roomName: string;
    dormName: DormRoom['dormName'];
    year: number;
    semester: number;
    bedPosition: number;
  };
  deviceCase?: DeviceCase;
  latestActivityRequest?: ActivityRequestSummary;
};

export type PointReasonType = 'PLUS' | 'MINUS' | 'ETC';

export type PointReason = {
  id: number;
  type: PointReasonType;
  point: number;
  comment: string;
  isActive: boolean;
};

export type PointRecord = {
  id: number;
  studentId?: number;
  studentNo: number;
  studentName: string;
  teacherName: string;
  reason: string;
  point: number;
  comment: string;
  baseDate: string;
};

export type PointSummary = {
  totalStudents: number;
  totalMeritPoints: number;
  totalPenaltyPoints: number;
  watchListCount: number;
  records: PointRecord[];
};

export type StudentOption = {
  id: number;
  studentNo: number;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  currentPoint: number;
};

export type StudentGender = 'male' | 'female';

export type AdminStudentSummary = StudentOption & {
  userId?: number;
  schoolYear?: number;
  enrollmentId?: number;
  enrollmentStatus?: StudentEnrollmentStatus;
  gender?: StudentGender;
  email?: string;
  phone?: string;
  roles: UserRole[];
  lastLoginAt?: string;
};

export type AdminStaffSummary = {
  id: number;
  userId: number;
  staffNo: number;
  name: string;
  managedClasses?: Array<{ grade: number; classNo: number }>;
  email?: string;
  phone?: string;
  roles: UserRole[];
  lastLoginAt?: string;
};

export type AdminUserStatus = 'active' | 'restricted' | 'graduated' | 'deleted';

export type AdminIdentityListQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  schoolYear?: number;
  grade?: number;
  classNo?: number;
  sortBy?: 'identifier' | 'name' | 'lastLoginAt';
  sortOrder?: 'asc' | 'desc';
};

export type StudentEnrollmentStatus = 'active' | 'graduated' | 'transferred' | 'withdrawn';

export type AdminSchoolYearSummary = {
  id: number;
  year: number;
  isActive: boolean;
};

export type RosterImportRowInput = {
  rowNumber: number;
  studentNo: number;
  name: string;
  gender?: StudentGender | '0' | '1' | '남' | '여' | string;
  phone?: string;
  email?: string;
  previousStudentNo?: number;
  userId?: number;
};

export type RosterImportAction =
  'create' | 'update' | 'unchanged' | 'graduate' | 'conflict' | 'invalid';

export type RosterImportPreviewRow = {
  rowNumber: number;
  action: RosterImportAction;
  studentNo?: number;
  previousStudentNo?: number;
  name?: string;
  matchedUserId?: number;
  matchedStudentId?: number;
  messages: string[];
};

export type RosterImportPreview = {
  schoolYear: number;
  activeSchoolYear: number;
  rows: RosterImportPreviewRow[];
  summary: Record<RosterImportAction, number>;
  canApply: boolean;
};

export type RosterImportApplyResult = RosterImportPreview & {
  ok: true;
  batchId: number;
};

export type AdminRoleSummary = {
  id: number;
  name: string;
  label: string;
  userCount: number;
  permissionCount: number;
};

export type AdminPermissionSummary = {
  id: number;
  name: string;
  label: string;
  description?: string;
};

export type AdminAuditLog = {
  id: number;
  actorName: string;
  action: string;
  targetType: string;
  targetId?: string;
  createdAt: string;
};

export type AdminAuditLogListQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  from?: string;
  to?: string;
  sortBy?: 'createdAt' | 'actorName' | 'action' | 'targetType';
  sortOrder?: 'asc' | 'desc';
};

export type DeviceCase = {
  id: number;
  isConnected: boolean;
  isOpen: boolean;
  lastSeenAt: string;
};

export type DeviceCaseCommand = {
  id: number;
  deviceCaseId: number;
  actorName: string;
  command: 'open' | 'close' | 'sync';
  status: 'queued' | 'sent' | 'succeeded' | 'failed';
  createdAt: string;
};

export type DormRoom = {
  id: number;
  name: string;
  capacity: number;
  grade: number;
  dormName: '송죽관' | '동백관';
  assignedCount: number;
  residents?: DormRoomResident[];
  openReportCount?: number;
};

export type DormAssignment = {
  id: number;
  roomId: number;
  userId: number;
  studentId: number;
  dormName: DormRoom['dormName'];
  roomName: string;
  studentNo: number;
  studentName: string;
  grade: number;
  classNo: number;
  number: number;
  year: number;
  semester: number;
  bedPosition: number;
};

export type DormRoomResident = Pick<
  DormAssignment,
  | 'id'
  | 'userId'
  | 'studentId'
  | 'studentNo'
  | 'studentName'
  | 'grade'
  | 'classNo'
  | 'number'
  | 'bedPosition'
>;

export type DormStudentOption = {
  studentId: number;
  userId: number;
  studentNo: number;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  gender?: string;
  dormName?: DormRoom['dormName'];
  currentRoom?: string;
};

export type DormRoommateBlock = {
  id: number;
  studentUserId: number;
  studentNo: number;
  studentName: string;
  blockedUserId: number;
  blockedStudentNo: number;
  blockedStudentName: string;
  year: number;
  semester: number;
};

export type DormDrawPlacement = {
  userId: number;
  studentNo: number;
  studentName: string;
  grade: number;
  classNo: number;
  roomId: number;
  dormName: DormRoom['dormName'];
  roomName: string;
  bedPosition: number;
};

export type DormDrawViolation = {
  code: string;
  message: string;
  userId?: number;
  roomId?: number;
};

export type DormDrawBlockPair = {
  studentUserId: number;
  blockedUserId: number;
};

export type DormDrawPreview = {
  year: number;
  semester: number;
  targetUserIds: number[];
  placements: DormDrawPlacement[];
  fixedPlacements: DormDrawPlacement[];
  roommateBlocks: DormDrawBlockPair[];
  unassigned: Array<{
    userId: number;
    studentNo: number;
    name: string;
    reason: string;
  }>;
  ineligible: Array<{
    userId: number;
    studentNo: number;
    name: string;
    reason: string;
  }>;
  violations: DormDrawViolation[];
};

export type DormReportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED';

export type DormReport = {
  id: number;
  roomId: number;
  dormName: string;
  roomName: string;
  studentNo: number;
  studentName: string;
  description: string;
  imageUrl?: string;
  status: DormReportStatus;
  comment?: string;
  createdAt: string;
};

export type ActivityRequestStatus =
  'draft' | 'submitted' | 'approved' | 'rejected' | 'canceled' | 'completed';

export type ActivityTimeSlotId =
  | 'morning-1'
  | 'morning-2'
  | 'afternoon-1'
  | 'afternoon-2'
  | 'evening-1'
  | 'evening-2'
  | 'evening-3';

export type ActivityRequestAdminStatus = 'pending' | 'approved' | 'rejected';

export type ActivityRequestAdminListQuery = {
  page?: number;
  pageSize?: 20 | 50 | 100;
  search?: string;
  date?: string;
  status?: ActivityRequestAdminStatus;
  assignedToMe?: boolean;
  sortBy?:
    | 'issuedNumber'
    | 'representative'
    | 'participantCount'
    | 'purpose'
    | 'location'
    | 'startsAt'
    | 'advisorTeacherName'
    | 'status';
  sortOrder?: 'asc' | 'desc';
};

export type ActivityRequestParticipant = {
  studentId: number;
  studentNo: number;
  studentName: string;
  isRepresentative: boolean;
};

export type ActivityRequestStudentOption = {
  studentId: number;
  studentNo: number;
  studentName: string;
  grade: number;
  classNo: number;
  number: number;
};

export type ActivityRequestTeacherOption = {
  userId: number;
  staffNo: number;
  name: string;
};

export type ActivityRequestSummary = {
  id: number;
  createdAt?: string;
  representativeStudentId?: number;
  studentNo: number;
  studentName: string;
  participants?: ActivityRequestParticipant[];
  creatorName?: string;
  advisorTeacherName?: string;
  reviewerName?: string;
  /** @deprecated Use advisorTeacherName or reviewerName. */
  teacherName?: string;
  location: string;
  startsAt: string;
  endsAt: string;
  activitySlotIds?: ActivityTimeSlotId[];
  purpose: string;
  status: ActivityRequestStatus;
  issuedNumber?: string;
  issuedAt?: string;
  rejectionReason?: string;
};

export type ActivityRequestDetail = ActivityRequestSummary & {
  participants: ActivityRequestParticipant[];
};

export type ActivityRequestAdminSummary = Omit<
  ActivityRequestSummary,
  'participants' | 'status'
> & {
  representativeStudentId: number;
  participants: ActivityRequestParticipant[];
  status: ActivityRequestAdminStatus;
  workflowStatus: ActivityRequestStatus;
};

export type ActivityRequestPrintBatch = {
  date: string;
  documents: ActivityRequestAdminSummary[];
};

export type AdminDashboard = {
  pointSummary: Pick<
    PointSummary,
    'totalStudents' | 'totalMeritPoints' | 'totalPenaltyPoints' | 'watchListCount'
  >;
  deviceCases: DeviceCase[];
  pendingActivityRequests: ActivityRequestAdminSummary[];
};
