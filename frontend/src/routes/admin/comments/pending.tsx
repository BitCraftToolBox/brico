/** `/admin/comments/pending` — comments awaiting review. */
import {CommentStatus} from "@brico/crafts/comments";
import {AdminCommentList} from "~/components/comments/admin/AdminCommentList";
import {AdminLayout} from "~/components/comments/admin/AdminLayout";

export default function AdminPendingCommentsPage() {
    return (
        <AdminLayout>
            <AdminCommentList fixedStatus={CommentStatus.Pending}/>
        </AdminLayout>
    );
}
