/** CAD API client for configuration lifecycle operations and snapshots. */
import { http } from './httpClient';
import type {
  ConfigurationDto,
  ConfigurationsListDto,
  NextOptionsDto,
  Category,
  ColumnPlan,
  ColumnDesign,
  TerminalSelection,
} from '@/types/cad';

export type ConfigurationStatus = ConfigurationDto['status'];

export const cadService = {
  list(params: { status?: ConfigurationStatus; page?: number; limit?: number } = {}): Promise<ConfigurationsListDto> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return http.get<ConfigurationsListDto>(`/cad/configurations${qs ? `?${qs}` : ''}`);
  },

  create(data: { name?: string; category?: Category }): Promise<ConfigurationDto> {
    return http.post<ConfigurationDto>('/cad/configurations', data);
  },

  get(id: string): Promise<ConfigurationDto> {
    return http.get<ConfigurationDto>(`/cad/configurations/${id}`);
  },

  setCategory(id: string, category: Category): Promise<ConfigurationDto> {
    return http.patch<ConfigurationDto>(`/cad/configurations/${id}/category`, { category });
  },

  setColumnPlan(id: string, plan: ColumnPlan): Promise<ConfigurationDto> {
    return http.patch<ConfigurationDto>(`/cad/configurations/${id}/column-plan`, plan);
  },

  updateDesign(id: string, columnDesigns: ColumnDesign[], terminalSelections?: TerminalSelection[]): Promise<ConfigurationDto> {
    return http.patch<ConfigurationDto>(`/cad/configurations/${id}/design`, { columnDesigns, terminalSelections });
  },

  reset(id: string): Promise<ConfigurationDto> {
    return http.post<ConfigurationDto>(`/cad/configurations/${id}/reset`);
  },

  finalize(id: string): Promise<ConfigurationDto> {
    return http.post<ConfigurationDto>(`/cad/configurations/${id}/finalize`);
  },

  reorder(id: string): Promise<ConfigurationDto> {
    return http.post<ConfigurationDto>(`/cad/configurations/${id}/reorder`);
  },

  nextOptions(id: string, columnIndex: number): Promise<NextOptionsDto> {
    return http.get<NextOptionsDto>(`/cad/configurations/${id}/next-options?columnIndex=${columnIndex}`);
  },
};
