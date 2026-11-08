// Terms of use, version 1 (Claude draft for Hoan to edit, spec A8). Editing
// the text means bumping TERMS_VERSION in constants/social.ts.
export interface TermsSection {
  title: string;
  items: string[];
}

export const TERMS_TITLE = "Điều khoản sử dụng mạng xã hội";

export const TERMS_INTRO =
  'Tính năng mạng xã hội giúp học viên và PT chia sẻ hành trình tập luyện. Khi bấm "Đồng ý", bạn xác nhận đã đọc và chấp nhận các điều khoản dưới đây.';

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: "1. Quy tắc cộng đồng",
    items: [
      "Chỉ đăng nội dung của chính bạn và nội dung bạn có quyền chia sẻ.",
      "Không đăng nội dung xúc phạm, quấy rối, thù ghét, khiêu dâm, bạo lực hoặc vi phạm pháp luật.",
      "Không đăng thông tin cá nhân của người khác (số điện thoại, địa chỉ, ảnh) khi chưa được họ đồng ý.",
      "Không giả mạo người khác và không spam.",
    ],
  },
  {
    title: "2. Quyền riêng tư của bài viết",
    items: [
      "Mọi người: mọi tài khoản trong ứng dụng đều xem được bài viết.",
      "Bạn bè: chỉ bạn bè của bạn xem được. PT và quản trị viên phụ trách bạn mặc định là bạn bè của bạn.",
      "Chỉ mình tôi: chỉ bạn xem được, ngoại trừ quản trị viên như nêu ở mục 3.",
      "Bạn chọn quyền riêng tư cho từng bài viết và có thể đổi sau khi đăng.",
    ],
  },
  {
    title: "3. Quyền của quản trị viên",
    items: [
      'Quản trị viên cấp cao (super admin) có thể xem mọi bài viết, kể cả bài ở chế độ "Chỉ mình tôi", và tin nhắn giữa các học viên, nhằm đảm bảo an toàn và kiểm duyệt.',
      "PT xem được bài viết của các học viên thuộc nhóm do PT phụ trách.",
      "Quản trị viên chỉ dùng quyền này để xử lý báo cáo, bảo vệ người dùng và duy trì ứng dụng.",
    ],
  },
  {
    title: "4. Báo cáo và kiểm duyệt",
    items: [
      "Bạn có thể báo cáo bài viết, bình luận hoặc người dùng vi phạm.",
      "Quản trị viên xem xét báo cáo và có thể gỡ nội dung vi phạm hoặc khóa tính năng của tài khoản vi phạm.",
    ],
  },
  {
    title: "5. Xóa nội dung và tài khoản",
    items: [
      "Bạn có thể xóa bài viết của mình bất cứ lúc nào; ảnh đi kèm bị xóa cùng bài viết.",
      "Quản trị viên cấp cao có thể xóa nội dung vi phạm.",
      "Khi tài khoản của bạn bị xóa, toàn bộ bài viết và ảnh của bạn cũng bị xóa.",
    ],
  },
  {
    title: "6. Thay đổi điều khoản",
    items: [
      "Khi điều khoản thay đổi, bạn sẽ được yêu cầu đồng ý lại trước khi tiếp tục dùng tính năng mạng xã hội.",
    ],
  },
];
