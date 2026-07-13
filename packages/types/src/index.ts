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
  authorName?: string;
  viewCount: number;
  publishedAt: string;
};

export type NoticeDetail = NoticeListItem & {
  content: string;
  attachments: UploadedFileSummary[];
};

export type NoticeSummary = DashboardNotice & {
  content: string;
  authorName?: string;
  viewCount: number;
  attachments?: UploadedFileSummary[];
};

export type DashboardPetition = {
  id: number;
  title: string;
  participantCount: number;
  threshold: number;
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

export type LostItemSummary = {
  id: number;
  type: 'lost' | 'found';
  itemName: string;
  location: string;
  status: 'open' | 'matched' | 'closed' | 'hidden';
  description?: string;
  occurredAt?: string;
  authorName?: string;
  attachments?: UploadedFileSummary[];
};

export type LostItemDetail = Omit<LostItemSummary, 'attachments'> & {
  attachments: UploadedFileSummary[];
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
};

export type RichTextMark =
  | { type: 'bold' | 'italic' | 'underline' | 'strike' }
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
      name?: string;
      jshsus?: string;
      roles?: UserRole[];
      permissions: string[];
    }
  | {
      isLogined: false;
    };

export type UserRole =
  'system_admin' | 'student_affairs_head' | 'teacher' | 'student_council' | 'student';

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

export type AdminStudentSummary = StudentOption & {
  userId?: number;
};

export type AdminStaffSummary = {
  id: number;
  userId: number;
  staffNo: number;
  name: string;
  department?: string;
  title?: string;
  isStudentAffairsHead: boolean;
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
};

export type DormAssignment = {
  id: number;
  roomName: string;
  studentNo: number;
  studentName: string;
  year: number;
  semester: number;
  bedPosition: number;
};

export type DormStudentOption = {
  userId: number;
  studentNo: number;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  currentRoom?: string;
};

export type DormReportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED';

export type DormReport = {
  id: number;
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

export type ActivityRequestSummary = {
  id: number;
  createdAt?: string;
  studentNo: number;
  studentName: string;
  teacherName?: string;
  location: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
  status: ActivityRequestStatus;
  issuedNumber?: string;
  rejectionReason?: string;
};

export type ActivityRequestDetail = ActivityRequestSummary;

export type AdminDashboard = {
  pointSummary: Pick<
    PointSummary,
    'totalStudents' | 'totalMeritPoints' | 'totalPenaltyPoints' | 'watchListCount'
  >;
  deviceCases: DeviceCase[];
  dormRooms: DormRoom[];
  pendingActivityRequests: ActivityRequestSummary[];
  pendingPetitions: DashboardPetition[];
};
