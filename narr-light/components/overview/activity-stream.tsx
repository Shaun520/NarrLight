/**
 * 创作活动流
 *
 * 卡片头（标题）+ 时间线样式活动列表（.activity-item）。
 * ac-dot 颜色与活动类别对应（edit/ai/check/done/gen）。
 */
import { Clock } from 'lucide-react';
import type { OverviewActivity } from '@/lib/services/overview-service';

interface ActivityStreamProps {
  activities: OverviewActivity[];
}

export function ActivityStream({ activities }: ActivityStreamProps) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <Clock />
          创作活动
        </h3>
      </div>
      <div className="card-body activity-stream">
        {activities.map((a, idx) => (
          <div key={idx} className="activity-item">
            <div className={`ac-dot ${a.kind}`} />
            <div className="ac-body">
              <div className="ac-text">
                {a.textBefore}
                <b>{a.bold}</b>
                {a.textAfter}
              </div>
              <div className="ac-time">{a.time}</div>
            </div>
          </div>
        ))}
        {activities.length === 0 ? (
          <div className="ac-time">暂无活动</div>
        ) : null}
      </div>
    </div>
  );
}

export default ActivityStream;
