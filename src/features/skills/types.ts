export type SkillMeta = {
  name: string;
  description: string;
  path: string;
};

export type Skill = SkillMeta & {
  body: string;
};
