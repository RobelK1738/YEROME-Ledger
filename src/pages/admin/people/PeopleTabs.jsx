import { SectionNav } from '../../../components/ui/Tabs.jsx';

export function PeopleTabs() {
  return (
    <SectionNav label="US Persons sections" items={[
      { to: '/admin/people', label: 'People', icon: 'users', end: true },
      { to: '/admin/people/referrals', label: 'Referrals', icon: 'link' },
    ]} />
  );
}
