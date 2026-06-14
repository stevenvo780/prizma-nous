import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { UserEntity } from "../../users/entities/user.entity";

@Entity("plugin_settings")
@Unique("uq_plugin_setting_user_service_key", ["user", "service", "pluginKey"])
@Index(["user", "service"])
@Index(["user", "service", "pluginKey"])
export class PluginSetting {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: UserEntity;

  @Column()
  service: string;

  @Column()
  pluginKey: string;

  @Column({ default: false })
  enabled: boolean;

  @Column("json", { default: {} })
  config: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
