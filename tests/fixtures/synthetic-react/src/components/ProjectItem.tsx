import React from 'react';

export interface ProjectItemProps {
  id: number;
  title: string;
  status: string;
}

export const ProjectItem: React.FC<ProjectItemProps> = ({ id, title, status }) => {
  return (
    <div className="project-item">
      <h3>{title}</h3>
      <span className={`status-${status}`}>{status}</span>
    </div>
  );
};
