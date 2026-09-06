import * as commonApi from '@/api/common';
import * as repoApi from '@/api/domain/gitRepoApi';
import * as diffApi from '@/api/domain/gitDiffApi';
import * as historyApi from '@/api/domain/historyApi';
import * as aiApi from '@/api/domain/aiApi';
import * as systemApi from '@/api/domain/systemApi';

export * from '@/api/common';
export * from '@/api/domain/gitRepoApi';
export * from '@/api/domain/gitDiffApi';
export * from '@/api/domain/historyApi';
export * from '@/api/domain/aiApi';
export * from '@/api/domain/systemApi';

export function useGitApi() {
  return {
    ...commonApi,
    ...repoApi,
    ...diffApi,
    ...historyApi,
    ...aiApi,
    ...systemApi,
  };
}
