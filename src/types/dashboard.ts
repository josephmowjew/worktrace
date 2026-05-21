export type DashboardStats = {
  projectsWorkedOn: number;
  projectsDelta: number;
  commitsThisWeek: number;
  commitsDeltaPercent: number;
  meetingsLogged: number;
  meetingsDelta: number;
  reportsGenerated: number;
  reportsDelta: number;
};

export type DailyActivityHours = {
  day: string;
  date: string;
  hours: number;
};

export type ProjectBreakdown = {
  projectId: string;
  projectName: string;
  hours: number;
  percentage: number;
};
