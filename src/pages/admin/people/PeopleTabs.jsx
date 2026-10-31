import { SectionNav } from '../../../components/ui/Tabs.jsx';

export function PeopleTabs() {
  return (
    <SectionNav label="Owner sections" items={[
      { to: '/admin/people', label: 'Owners', icon: 'users', end: true },
      { to: '/admin/people/referrals', label: 'Referrals', icon: 'link' },
    ]} />
  );
}
