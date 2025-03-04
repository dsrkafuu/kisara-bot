import request from '@app/request';
import { OB11MessageData } from '@napcat/onebot';

export const respondGroup = (
  data,
  ctx,
  groupId: string,
  message: OB11MessageData[]
) => {
  return request('/send_group_msg', {
    data: message,
  });
};
