import { RoleGate } from "../components/RoleGate";
import { PageStub } from "../components/PageStub";

export function UsersPage() {
  return (
    <RoleGate roles={["admin"]}>
      <PageStub
        title="Users"
        description="User administration lands with the users wave."
      />
    </RoleGate>
  );
}
