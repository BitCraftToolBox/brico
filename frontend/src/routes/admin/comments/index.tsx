/** `/admin/comments` — recent comments across all pages, for moderators. */
import {AdminCommentList} from "~/components/comments/admin/AdminCommentList";
import {AdminLayout} from "~/components/comments/admin/AdminLayout";

export default function AdminCommentsPage() {
    return (
        <AdminLayout>
            <AdminCommentList/>
        </AdminLayout>
    );
}
